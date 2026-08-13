import {RedisCache} from '../cache/RedisCache.class';
import {ErrorMessage} from '../exception/ErrorMessage';
import {TokenBucketResult} from './TokenBucket';

export interface TokenBucketRequest {
    key: string;        // 桶键
    rate: number;       // 每秒补充令牌数
    capacity: number;   // 桶容量（最大突发）
}

/**
 * Redis 令牌桶（多桶合并单 Lua，一次 Redis 访问原子判断全部桶）
 *
 * - 单 Lua 脚本循环处理多个桶：读状态 -> 惰性补充 -> 扣减/拒绝 -> 写状态，并发安全、一次网络往返；
 * - 惰性补充：按毫秒时间差补令牌，无需定时任务；
 * - 自清理：每次访问刷新空闲 TTL（空桶回满时间 + 1s 余量，下限 60s，上限 7 天），无请求的桶自动过期；
 * - 参数校验：任一桶 rate<=0 / capacity<1 视为配置错误直接抛错，由调用方决定降级策略。
 *
 * 依赖 RedisCache 暴露的通用 eval（连接安全），不直接持有连接细节。
 */
export class RedisTokenBucket {
    /**
     * 一次 Redis 访问取多个桶的令牌
     *
     * @param {RedisCache} cache
     * @param {Array<TokenBucketRequest>} buckets - 桶列表（如 [全局桶, 接口桶]）
     * @param {number} now - 毫秒时间戳，缺省取系统时间（测试可注入）
     * @return {Promise<Array<TokenBucketResult>>} 与 buckets 一一对应
     */
    public static async take(
        cache: RedisCache,
        buckets: Array<TokenBucketRequest>,
        now?: number
    ): Promise<Array<TokenBucketResult>> {
        if (!buckets || buckets.length === 0) {
            return [];
        }

        const timestamp = (now != null) ? Math.floor(now) : Date.now();
        // ARGV 排布：ARGV[1] = 时间戳，之后每个桶依次为 rate/capacity/ttl（索引 (i-1)*3+2/+3/+4）
        const args: Array<string> = [String(timestamp)];
        for (const bucket of buckets) {
            if (!Number.isFinite(bucket.rate) || bucket.rate <= 0) {
                throw new ErrorMessage(10002, `RedisTokenBucket rate must be > 0, got: ${bucket.rate}`);
            }
            if (!Number.isFinite(bucket.capacity) || bucket.capacity < 1) {
                throw new ErrorMessage(10002, `RedisTokenBucket capacity must be >= 1, got: ${bucket.capacity}`);
            }
            // 空闲 TTL：空桶回满所需时间 + 1s 余量，下限 60s，上限 7 天，避免无效长驻
            const idleTtl = Math.min(Math.max(Math.ceil(bucket.capacity / bucket.rate) + 1, 60), 7 * 24 * 3600);
            args.push(String(bucket.rate), String(bucket.capacity), String(idleTtl));
        }

        const script = `
            local now = tonumber(ARGV[1])
            local results = {}
            for i = 1, #KEYS do
                local rate = tonumber(ARGV[(i - 1) * 3 + 2])
                local capacity = tonumber(ARGV[(i - 1) * 3 + 3])
                local ttl = tonumber(ARGV[(i - 1) * 3 + 4])
                -- 桶状态存 hash：tokens 当前令牌数（可为小数）、ts 上次补充时间（毫秒）
                local tokens = tonumber(redis.call('hget', KEYS[i], 'tokens'))
                local ts = tonumber(redis.call('hget', KEYS[i], 'ts'))
                if tokens == nil then tokens = capacity end  -- 首次访问：满桶
                if ts == nil then ts = now end
                if now > ts then
                    -- 惰性补充：按时间差补令牌，封顶 capacity（与内存桶同公式）
                    tokens = math.min(capacity, tokens + (now - ts) / 1000 * rate)
                end
                local allowed = 0
                local wait = 0
                local remaining = tokens
                if tokens >= 1 then
                    -- 有令牌：扣 1
                    tokens = tokens - 1
                    allowed = 1
                    remaining = tokens
                else
                    -- 无令牌：等待时间 = 补回 1 个令牌所需毫秒数，最小 1ms
                    wait = math.ceil((1 - tokens) / rate * 1000)
                    if wait < 1 then wait = 1 end
                end
                redis.call('hmset', KEYS[i], 'tokens', tokens, 'ts', now)  -- 写回状态
                redis.call('expire', KEYS[i], ttl)                          -- 刷新空闲 TTL，无请求自动过期
                -- 回满所需毫秒数（供 X-RateLimit-Reset 使用）
                local reset = math.ceil((capacity - remaining) / rate * 1000)
                results[i] = {allowed, wait, remaining, reset}
            end
            return results
        `;
        // Lua 在 Redis 单实例上原子执行（EVAL），多桶合并为一次网络往返且并发安全；
        // 返回为 1 基 Lua 数组 {allowed, wait(ms), remaining, reset(ms)}，node_redis 转为 0 基 JS 数组
        const r = await cache.eval(script, {
            keys: buckets.map((bucket) => bucket.key),
            arguments: args
        }) as Array<Array<string | number>>;
        return r.map((item) => {
            const allowed = Number(item[0]) === 1;
            const waitMs = Number(item[1]);
            return {
                allowed,
                retryAfter: (allowed) ? 0 : Math.max(1, Math.ceil(waitMs / 1000)),
                remaining: Number(item[2]),
                reset: Math.max(0, Math.ceil(Number(item[3]) / 1000))
            };
        });
    }
}
