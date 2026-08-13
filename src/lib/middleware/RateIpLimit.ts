import {Context as KoaContext, Middleware as KoaMiddleware, Next as KoaNext} from 'koa';
import {Utils} from '../Utils';
import {LruTokenBucketStore} from '../tokenbucket/TokenBucket';
import {ErrorMessage} from '../exception/ErrorMessage';
import {Logger} from '../Logger';
import {RateLimitConfig, validateBucketConfig} from './RateLimit';

/**
 * 按 IP 桶限流中间件（进程内 LRU，不依赖 Redis）
 *
 * IP 是高基数 key，Redis 存每个 IP 的桶浪费且占内存；单客户端防滥用是“尽力而为”，
 * 进程内 LRU 零成本、无网络。注意：LB 轮询分发下每个进程只见部分 IP 流量，
 * per-IP 上限会放宽约 N 倍（N=进程数），作为防滥用可接受。
 *
 * 配置（global.json -> ipLimit）每请求直接读取并现算，不做派生缓存；
 * token 桶是有状态对象，跨请求保留（令牌累积），仅当 rate/capacity 真正变化时才重建 store。
 *
 * @param {() => RateLimitConfig | null} getConfig - 实时读取配置（来自 SettingManager，gRPC 下发即生效）
 * @return {KoaMiddleware}
 */
export function rateIpLimit(getConfig: () => RateLimitConfig | null): KoaMiddleware {
    let store: LruTokenBucketStore | null = null;

    return async (ctx: KoaContext, next: KoaNext): Promise<void> => {
        // 未配置 → 放行
        const cfg = getConfig();
        if (!cfg) {
            store = null;
            await next();
            return;
        }

        // 配置变动或桶不存在，则重建桶
        if (!store || store.rate !== cfg.rate || store.capacity !== cfg.capacity) {
            const valid = validateBucketConfig('ip', cfg);
            store = valid ? new LruTokenBucketStore(valid.rate, valid.capacity) : null;

            // 重建桶失败 → 放行
            if (!store) {
                await next();
                return;
            }
        }

        // 令牌发放控制
        const key = Utils.getIP(ctx.req) || 'unknown';
        const bucket = store.get(key);
        const result = bucket.take();

        ctx.set('X-RateLimit-Limit', String(Math.floor(store.capacity)));
        ctx.set('X-RateLimit-Remaining', String(Math.max(0, Math.floor(result.remaining))));
        ctx.set('X-RateLimit-Reset', String(Math.max(0, Math.ceil(result.reset))));

        if (!result.allowed) {
            ctx.set('Retry-After', String(result.retryAfter));
            Logger.warn(`[RATE_LIMIT] ip exceeded, key=${key}, retryAfter=${result.retryAfter}, remaining=${result.remaining}, denyCount=${bucket.denyCount}`);
            ctx.body = ErrorMessage.format(new ErrorMessage(10004, result.retryAfter));
            return;
        }

        await next();
    };
}
