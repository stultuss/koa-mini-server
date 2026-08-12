import {Context as KoaContext, Middleware as KoaMiddleware, Next as KoaNext} from 'koa';
import {ErrorMessage} from '../exception/ErrorMessage';
import {CacheFactory} from '../cache/CacheFactory.class';
import type {TokenBucketResult} from '../cache/RedisCache.class';
import {Logger} from '../Logger';
import {Utils} from '../Utils';

export interface RateLimitConfig {
    rate: number;        // 每秒补充令牌数
    capacity: number;    // 桶容量（最大突发）
    failOpen?: boolean;  // Redis 异常/配置错误时放行（默认 true）
}

/**
 * 创建单桶令牌桶限流中间件
 *
 * 最佳实践：
 * - 拒绝时返回 Retry-After 建议等待秒数 + X-RateLimit-Limit/Remaining/Reset 限流头；
 * - Redis 异常或配置错误默认 fail-open（放行 + 错误日志），可通过 config.failOpen=false 改为 fail-closed；
 * - 拒绝时写入 rl:{path}:{key}:deny 计数（TTL 1h），便于监控；
 * - 中间件自包含：拒绝/异常直接写结构化 ctx.body（ErrorMessage.format），无需外部错误边界。
 *
 * 全局桶设计说明（服务级总 QPS 保护，推荐按进程限流）：
 * - 本中间件为 server 层引用，桶键带接口前缀（rl:{ctx.path}:{key}），
 *   即使 keyBy 返回固定值也只是“接口级全局桶”，且跨进程共享同一个 Redis 桶；
 * - 压力测试结论（BENCHMARK_REPORT：i7-7820HQ 8 核，PM2 多进程）：
 *   单进程峰值约 2064 QPS，2 进程 4716 QPS，4 进程仅 5426 QPS，增速明显放缓
 *   （update 场景 1→4 进程加速比仅 1.05x），说明瓶颈在共享资源（MySQL/Redis），而非进程数；
 * - 因此推荐在 server 层增加“按进程限流的服务级全局桶”：进程内内存实现（不走 Redis），
 *   所有接口共用一个桶，单进程上限可配（如 1500~2000 QPS），集群总上限 ≈ 进程数 × 单进程上限；
 * - 优点：保护单进程不被压垮、零 Redis 开销（不加剧共享资源争用）、随 PM2 进程数线性扩展；
 * - 职责划分：进程内全局桶负责“总 QPS 兜底”，本文件的两个 Redis 桶负责“接口全局 / 按 IP”的分布式限流。
 *
 * @param {RateLimitConfig} config
 * @param {(params: Record<string, any>, ctx: KoaContext) => string} keyBy - 限流键生成函数
 * @return {KoaMiddleware}
 */
function createRateLimit(
    config: RateLimitConfig,
    keyBy: (params: Record<string, any>, ctx: KoaContext) => string
): KoaMiddleware {
    // 构建时校验桶配置：fail-closed 配置非法直接抛错，fail-open 降级为放行（记错误日志）
    if (!Number.isFinite(config.rate) || config.rate <= 0 || !Number.isFinite(config.capacity) || config.capacity < 1) {
        Logger.error(`[RATE_LIMIT] invalid bucket config, rate=${config.rate}, capacity=${config.capacity}`);
        if (config.failOpen === false) {
            throw new ErrorMessage(10002, `rate limit bucket config invalid, rate=${config.rate}, capacity=${config.capacity}`);
        }
        return async (_ctx: KoaContext, next: KoaNext) => next();
    }

    return async (ctx: KoaContext, next: KoaNext): Promise<void> => {
        // 中间件先于路由参数解析执行，这里自行合并路由/查询/请求体参数供 keyBy 使用
        const params = {
            ...(ctx.params as Record<string, any> || {}),
            ...ctx.request.query,
            ...((ctx.request.body as any) || {})
        };
        let key: string;
        try {
            key = String(keyBy(params, ctx) || '');
        } catch (e) {
            key = '';
        }
        if (!key) {
            key = Utils.getIP(ctx.req); // keyBy 返回空值时回退到 IP
        }

        const bucketKey = `rl:${ctx.path}:${key}`;
        const cache = CacheFactory.instance().getCache(0);
        let result: TokenBucketResult;
        try {
            result = await cache.tokenBucket(bucketKey, config.rate, config.capacity);
        } catch (e) {
            Logger.error(`[RATE_LIMIT] tokenBucket error, key=${bucketKey}, error=${e.message}`);
            if (config.failOpen === false) {
                ctx.body = ErrorMessage.format(e); // fail-closed：结构化报错
                return;
            }
            await next(); // fail-open：Redis 异常时放行
            return;
        }

        ctx.set('X-RateLimit-Limit', String(Math.floor(config.capacity)));
        ctx.set('X-RateLimit-Remaining', String(Math.max(0, Math.floor(result.remaining))));
        ctx.set('X-RateLimit-Reset', String(Math.max(0, Math.ceil(result.reset))));

        if (!result.allowed) {
            ctx.set('Retry-After', String(result.retryAfter));
            try {
                await cache.incr(`${bucketKey}:deny`, 3600);
            } catch (e) {
                Logger.error(`[RATE_LIMIT] deny counter error, key=${bucketKey}, error=${e.message}`);
            }
            Logger.warn(`[RATE_LIMIT] exceeded, key=${bucketKey}, retryAfter=${result.retryAfter}, remaining=${result.remaining}`);
            ctx.body = ErrorMessage.format(new ErrorMessage(10004, result.retryAfter));
            return;
        }

        await next();
    };
}

/**
 * 接口级全局桶限流中间件（rl:{path}:global）
 *
 * @param {RateLimitConfig} config
 * @return {KoaMiddleware}
 */
export function rateGlobalLimit(config: RateLimitConfig): KoaMiddleware {
    return createRateLimit(config, () => 'global');
}

/**
 * 按 IP 桶限流中间件（rl:{path}:{ip}）
 *
 * @param {RateLimitConfig} config
 * @return {KoaMiddleware}
 */
export function rateIpLimit(config: RateLimitConfig): KoaMiddleware {
    return createRateLimit(config, (_params: Record<string, any>, ctx: KoaContext) => Utils.getIP(ctx.req));
}
