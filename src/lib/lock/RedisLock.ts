import {RedisCache} from '../cache/RedisCache.class';

export interface RedisLockOptions {
    ttlMs?: number;             // 锁 TTL（毫秒），默认 5000；须略高于正常临界区耗时的上界
    timeoutMs?: number;         // 获取超时（毫秒），默认 3000；超过视为排队失败（10007）
    retryIntervalMs?: number;   // 竞争轮询间隔基准（毫秒），默认 100；实际等待 = 基准 ±50% 随机（jitter，防共振）
}

export const REDIS_LOCK_DEFAULT: Required<RedisLockOptions> = {
    // TTL 不宜过大：一次挂死 = 该 key 上 TTL 时长的请求全部排队失败（10007）；
    // 99% 临界区 <3s，取 5s 与超时熔断默认值对齐，兜底即可
    ttlMs: 5000,
    // 获取超时必须小于超时熔断（5s）：排队成功后仍留出执行窗口，避免刚拿到锁就被熔断 cut
    timeoutMs: 3000,
    // 轮询间隔不宜过小：N 个等待者同拍抢锁会放大 Redis 流量（thundering herd）；
    // 100ms 基准 + ±50% jitter，3s 超时内约 20~40 次尝试，锁释放后感知延迟 ≤100ms，
    // 对排队中的请求无感，但抢锁流量仅为 20ms 固定间隔的 1/5
    retryIntervalMs: 100
};

/**
 * Redis 分布式互斥锁（跨进程串行化关键区）
 *
 * - 原子获取：SET key token NX PX ttl，多进程同时竞争只有一个赢家；
 * - 安全释放：仅持有者（token 匹配）可 DEL，防止锁过期被他人重获后误删；
 * - 崩溃自愈：持锁进程挂掉后 TTL 到期自动释放，无死锁；
 * - 非严格 FIFO：竞争时轮询抢锁，谁先抢到谁进，不保证到达顺序（互斥语义已足够）。
 */
export class RedisLock {
    private static readonly ACQUIRE_SCRIPT = `
        local ok = redis.call('set', KEYS[1], ARGV[1], 'nx', 'px', ARGV[2])
        if ok then return 1 else return 0 end
    `;

    private static readonly RELEASE_SCRIPT = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        end
        return 0
    `;

    /**
     * 尝试获取一次锁（原子，不等待）
     *
     * @param {RedisCache} cache
     * @param {string} key - 锁键（如 KoaMiniServer:queue:uid:1）
     * @param {string} token - 持有者标识（须跨进程唯一，如 RandomTools.uuid()）
     * @param {number} ttlMs - 锁 TTL（毫秒）
     * @return {Promise<boolean>} 是否获取成功
     */
    public static async tryAcquire(cache: RedisCache, key: string, token: string, ttlMs: number): Promise<boolean> {
        const r = await cache.eval(RedisLock.ACQUIRE_SCRIPT, {
            keys: [key],
            arguments: [token, String(ttlMs)]
        });
        return Number(r) === 1;
    }

    /**
     * 轮询获取锁：直到成功或超过 timeoutMs
     *
     * @param {RedisCache} cache
     * @param {string} key - 锁键
     * @param {string} token - 持有者标识
     * @param {RedisLockOptions} options
     * @return {Promise<boolean>} 超时返回 false
     */
    public static async acquire(cache: RedisCache, key: string, token: string, options: RedisLockOptions = {}): Promise<boolean> {
        const ttlMs = options.ttlMs ?? REDIS_LOCK_DEFAULT.ttlMs;
        const timeoutMs = options.timeoutMs ?? REDIS_LOCK_DEFAULT.timeoutMs;
        const retryIntervalMs = options.retryIntervalMs ?? REDIS_LOCK_DEFAULT.retryIntervalMs;
        const deadline = Date.now() + timeoutMs;
        while (true) {
            if (await RedisLock.tryAcquire(cache, key, token, ttlMs)) {
                return true;
            }
            if (Date.now() >= deadline) {
                return false;
            }
            // jitter：等待基准 ±50% 随机（0.5~1.5 倍），避免多个等待者严格同拍共振抢锁
            const waitMs = retryIntervalMs * (0.5 + Math.random());
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
    }

    /**
     * 释放锁：仅持有者（token 匹配）才删除
     *
     * @param {RedisCache} cache
     * @param {string} key - 锁键
     * @param {string} token - 持有者标识
     * @return {Promise<boolean>} 是否成功删除
     */
    public static async release(cache: RedisCache, key: string, token: string): Promise<boolean> {
        const r = await cache.eval(RedisLock.RELEASE_SCRIPT, {
            keys: [key],
            arguments: [token]
        });
        return Number(r) === 1;
    }
}
