import {Context as KoaContext, Middleware as KoaMiddleware, Next as KoaNext} from 'koa';
import {ErrorMessage} from '../exception/ErrorMessage';

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
 * - 注意：Promise.race 无法取消已开始的异步任务，超时返回后底层任务可能仍在后台执行。
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

        // 接口级覆盖优先，缺省用全局默认
        const ms = (cfg.overrides && cfg.overrides[ctx.path] != null) ? cfg.overrides[ctx.path] : cfg.default;

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

        try {
            await Promise.race([next(), timeoutPromise]);
        } catch (e) {
            if (e instanceof ErrorMessage && e.code === 10006) {
                ctx.body = ErrorMessage.format(e); // 超时：结构化响应，不抛给外层
                return;
            }
            throw e;
        } finally {
            clearTimeout(timer);
        }
    };
}
