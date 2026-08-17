import {Context as KoaContext, Middleware as KoaMiddleware, Next as KoaNext} from 'koa';
import {CacheFactory} from '../cache/CacheFactory.class';
import {TokenBucketResult} from '../tokenbucket/TokenBucket';
import {RedisTokenBucket} from '../tokenbucket/RedisTokenBucket';
import {ErrorMessage} from '../exception/ErrorMessage';
import {Logger} from '../Logger';

export interface RateLimitConfig {
    rate: number;                   // 每秒补充令牌数
    capacity: number;               // 桶容量（最大突发）
    apis?: string[];                // 仅 API 桶生效：需要走 API 桶的接口路径限制名单（如 ["/v1/demo"]），缺省/空 = 所有接口都走接口桶
}

export interface DbRateLimitConfig {
    global?: RateLimitConfig;       // 服务级全局桶（Redis，集群级，保护共享 MySQL）
    api?: RateLimitConfig;          // 接口级桶（Redis，按 apis 限制名单）
    failMode?: 'open' | 'close';    // Redis 故障策略：open=放行（默认，配合本地并发收紧）/ close=结构化拒绝
}

/**
 * 校验并归一化桶配置：非法配置返回 null 并去重记录错误日志（不抛错，由调用方跳过该桶）
 */
export function validateBucketConfig(name: string, config: RateLimitConfig): RateLimitConfig | null {
    if (!Number.isFinite(config.rate) || config.rate <= 0 || !Number.isFinite(config.capacity) || config.capacity < 1) {
        Logger.error(`[RATE_LIMIT] invalid ${name} bucket config, rate=${config.rate}, capacity=${config.capacity}`);
        return null;
    }
    return config;
}

/**
 * 全局桶 + 接口桶限流中间件（Redis 实现，合并为一次 Lua 调用）
 *
 * 设计说明（保护共享 MySQL，集群级上限）：
 * - 最前端 LB 把请求分配到具体 docker/进程，MySQL 是所有进程共享的瓶颈；进程内桶各自放行，
 *   N 个进程对 MySQL 的总流量没有上限；Redis 共享桶给出集群级硬顶，防止 MySQL 被击穿；
 * - global 与 api 两个桶合并进同一个 Lua 脚本（一次 Redis 访问，原子判断），避免每请求两次往返；
 * - 桶键：服务级全局桶 rl:global（所有接口共用一个），接口级桶 rl:api:{ctx.path}（按接口隔离）；
 * - 限制名单：配置了 api.apis 时，名单内接口走 global+api 两桶，不在名单内只走 global 桶；
 *   未配置 apis（缺省/空）则所有接口都走 global+api 两桶；
 * - Redis 故障策略 failMode：open=放行（默认，并收紧本地并发计数器 Inflight 阈值，
 *   用“单机在途并发”兜底，为 MySQL 争取喘息时间）/ close=结构化拒绝；
 * - 压力测试结论（BENCHMARK_REPORT：PM2 多进程）：单进程峰值约 2064 QPS（read_cache），
 *   写路径仅 499~745 QPS，4 进程总峰值约 5426 QPS——瓶颈在共享 MySQL/Redis，进程数加倍收益递减；
 *   单进程 global 上限按 ~2000 QPS 配置（当前 2000/6000），集群总上限 ≈ 进程数 × 单进程上限
 *
 * @param {() => DbRateLimitConfig} getConfig - 实时读取配置（来自 SettingManager，gRPC 下发即生效）
 * @param {{degrade(): void; restore(): void} | null} inflight - 本地并发计数器（Redis 故障时降级/恢复）
 * @return {KoaMiddleware}
 */
export function rateLimit(
    getConfig: () => DbRateLimitConfig,
    inflight: {degrade(): void; restore(): void} | null
): KoaMiddleware {
    let redisDown = false;

    // 解析并校验当前配置，派生本次请求用到的桶参数与故障策略
    const resolveBuckets = (cfg: DbRateLimitConfig) => {
        const globalCfg = (cfg.global) ? validateBucketConfig('global', cfg.global) : null;
        const apiCfg = (cfg.api) ? validateBucketConfig('api', cfg.api) : null;
        return {
            globalCfg,
            apiCfg,
            failMode: (cfg.failMode === 'close') ? 'close' : 'open',
            // 限制名单：api.apis 非空时，接口桶只对名单内接口生效；缺省/空则所有接口都走接口桶
            // （仅配 global 桶、无 api 桶时，apis 恒为 null，自然退化为纯全局限流）
            apis: (apiCfg?.apis && apiCfg?.apis.length > 0) ? apiCfg?.apis : null,
        };
    };

    return async (ctx: KoaContext, next: KoaNext): Promise<void> => {
        // 每请求直接读取当前配置并现算，不做派生缓存（与 InflightLimiter/TimeoutLimit 一致）
        const {globalCfg, apiCfg, failMode, apis} = resolveBuckets(getConfig() || {});

        // 未配置 → 放行
        if (!globalCfg && !apiCfg) {
            await next();
            return;
        }

        // 组装本次请求需要校验的桶列表
        const buckets: Array<{key: string; rate: number; capacity: number}> = [];
        // 全局桶，所有接口都生效
        if (globalCfg) {
            buckets.push({key: 'rl:global', rate: globalCfg.rate, capacity: globalCfg.capacity});
        }
        // 接口桶仅对限制名单内接口生效；未配置（缺省/空）则所有接口都走
        if (apiCfg && (!apis || apis.includes(ctx.path))) {
            buckets.push({key: `rl:api:${ctx.path}`, rate: apiCfg.rate, capacity: apiCfg.capacity});
        }

        // 本路径无桶需要校验（如只配了 api 桶且当前路径不在限制名单）→ 放行
        if (buckets.length === 0) {
            await next();
            return;
        }

        // 取令牌：合并为一次 Redis Lua 调用，原子判断全部桶
        let results: Array<TokenBucketResult>;
        try {
            results = await RedisTokenBucket.take(CacheFactory.instance().getCache(0), buckets, Date.now());
            // Redis 恢复：解除并发收紧，阈值调回正常值
            if (redisDown) {
                redisDown = false;
                inflight?.restore?.();
                Logger.warn('[RATE_LIMIT] redis recovered, restore inflight limit');
            }
        } catch (e) {
            Logger.error(`[RATE_LIMIT] redis token bucket error: ${e instanceof Error ? e.message : String(e)}`);

            if (failMode === 'close') {
                ctx.body = ErrorMessage.format(e);
                return;
            }
            // fail-open：放行；同时收紧本地并发计数器阈值（Inflight），
            // 用“单机在途并发”兜底，防止 Redis 故障期间进程被灌满，为 MySQL 争取喘息时间
            if (!redisDown && inflight) {
                redisDown = true;
                inflight.degrade();
                Logger.warn('[RATE_LIMIT] redis down, degrade inflight to maxOnRedisFail');
            }
            await next();
            return;
        }

        // 聚合：limit/remaining 取最小（最严格），reset 取最大；任一桶拒绝即拒绝，等待时间取最大
        let limit = Infinity;
        let remaining = Infinity;
        let reset = 0;
        let retryAfter = 0;
        results.forEach((result, i) => {
            limit = Math.min(limit, buckets[i].capacity);
            remaining = Math.min(remaining, result.remaining);
            reset = Math.max(reset, result.reset);
            if (!result.allowed) {
                retryAfter = Math.max(retryAfter, result.retryAfter);
            }
        });

        ctx.set('X-RateLimit-Limit', String(Math.floor(limit)));
        ctx.set('X-RateLimit-Remaining', String(Math.max(0, Math.floor(remaining))));
        ctx.set('X-RateLimit-Reset', String(Math.max(0, Math.ceil(reset))));

        if (retryAfter > 0) {
            ctx.set('Retry-After', String(retryAfter));
            Logger.warn(`[RATE_LIMIT] exceeded, keys=${buckets.map((b) => b.key).join(',')}, retryAfter=${retryAfter}, remaining=${remaining}`);
            ctx.body = ErrorMessage.format(new ErrorMessage(10004, retryAfter));
            return;
        }

        await next();
    };
}
