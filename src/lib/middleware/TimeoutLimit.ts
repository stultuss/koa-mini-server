import {Context as KoaContext, Middleware as KoaMiddleware, Next as KoaNext} from 'koa';
import {ErrorMessage} from '../exception/ErrorMessage';
import {Logger} from '../Logger';

export interface RequestTimeoutConfig {
    default?: number;                       // global.json 结构：默认超时（毫秒），如 30000
    overrides?: Record<string, number>;     // 按接口路径覆盖超时（毫秒），如充值发货长接口 /v1/deliver: 120000
    excludes?: string[];                    // 不需要熔断的接口路径（完全跳过超时控制）：以 / 结尾=前缀（startsWith），否则=精确（===）
}

/**
 * 请求超时熔断中间件（支持 gRPC 下发动态生效）
 *
 * - 对整条请求链路设置超时（可按接口路径覆盖更长超时或直接排除，如充值后发货的长接口），
 * - 超时直接返回结构化超时错误（code 10006），并释放并发槽位；
 * - 配置通过 getConfig 实时读取（来自 SettingManager，gRPC 下发即生效）：
 *   每请求直接读取当前配置并现算（排除匹配/超时值），不做派生缓存，与 InflightLimiter 一致；
 * - 仅接口层超时，不涉及 MySQL/Redis 查询级超时（查询超时由各自客户端/配置另行管理）；
 * - 注意：Promise.race 无法取消已开始的异步任务，超时返回后底层任务可能仍在后台执行；
 *   超时分支会观察其最终结局并记录日志（成功 debug / 失败 warn），避免"断线失联"；
 * - 超时判定基于 code === 10006（业务错误码段 30000+，不会冲突）；
 * - overrides 值须为正有限数（毫秒），非法值回退全局默认并记错误日志；
 * - 超时响应为 HTTP 200 + code 10006（非 5xx）：基于 HTTP 状态码的监控/LB 看不到超时，
 *   超时率需按 body.code 统计。
 *
 * @param {() => RequestTimeoutConfig} getConfig
 * @return {KoaMiddleware}
 */
export function requestTimeout(getConfig: () => RequestTimeoutConfig): KoaMiddleware {
    return async (ctx: KoaContext, next: KoaNext): Promise<void> => {
        // 未配置 → 放行
        const cfg = getConfig() || {};
        if (!cfg.default || cfg.default <= 0) {
            await next();
            return;
        }

        // 排除列表内的接口完全跳过超时控制：以 / 结尾=前缀匹配（startsWith），否则=精确匹配（===）
        for (const item of (cfg.excludes || [])) {
            if (item.endsWith('/') ? ctx.path.startsWith(item) : ctx.path === item) {
                await next();
                return;
            }
        }

        // 接口级覆盖优先，缺省用全局默认；
        // overrides 非法值（0/负数/非数字）回退全局默认，避免配错导致该接口全线立即超时
        let ms = cfg.default;
        const override = cfg.overrides && cfg.overrides[ctx.path];
        if (override != null) {
            if (Number.isFinite(override) && override > 0) {
                ms = override;
            } else {
                Logger.error(`[TIMEOUT] invalid override for ${ctx.path}: ${override}, fallback to default ${cfg.default}`);
            }
        }

        // 计时**竞速**开始，Promise.race 二选一：
        // - 业务链路（next()）先完成/报错 → 竞速结束，finally 里 clearTimeout 清掉计时器，不残留；
        // - 计时器先触发 → reject(new ErrorMessage(10006)) 赢得竞速，下方 catch 命中超时分支，
        //   返回结构化超时响应（HTTP 200 + code 10006），外层 InflightLimiter 的 finally
        //   同步释放并发槽位；
        // 注意：超时只结束当前请求的等待，Promise.race 无法取消已启动的下游任务，慢任务（如 MySQL 查询、发货回调）仍可能在后台继续执行。
        // 所以注意设计 **接口幂等**
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ErrorMessage(10006, ms)), ms);
        });

        // 业务链路单独持有：超时后其最终结局（成功/失败）需观察记录，避免"断线失联"
        let business: Promise<any> | null = null;
        try {
            business = next();
            await Promise.race([business, timeoutPromise]);
        } catch (e) {
            if (e instanceof ErrorMessage && e.code === 10006) {
                ctx.body = ErrorMessage.format(e); // 超时：结构化响应，不抛给外层
                // 超时事件日志 + 后台任务结局观察：race 已 settle，后台任务的
                // 最终结果（成功/失败）不会再有其他消费者，不观察则对日志完全不可见
                Logger.warn(`[TIMEOUT] request timed out, uri: ${ctx.path}, timeoutMs: ${ms}`);
                business?.then(
                    () => Logger.debug(`[TIMEOUT] background task completed after timeout, uri: ${ctx.path}, timeoutMs: ${ms}`),
                    (err: any) => Logger.warn(`[TIMEOUT] background task failed after timeout, uri: ${ctx.path}, timeoutMs: ${ms}, err: ${err instanceof Error ? err.message : String(err)}`)
                );
                return;
            }
            throw e;
        } finally {
            clearTimeout(timer);
        }
    };
}
