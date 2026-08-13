import {LRUCache} from 'lru-cache';

export interface TokenBucketResult {
    allowed: boolean;   // 是否放行
    retryAfter: number; // 拒绝时建议等待秒数（>=1，放行为 0）
    remaining: number;  // 本次消费后桶内剩余令牌数（>=0）
    reset: number;      // 距桶回满的秒数（>=0）
}

/**
 * 内存令牌桶（进程内实现）
 *
 * - 令牌桶算法：容量 capacity（最大突发），按 rate/秒 惰性补充——只有被 take() 访问时
 *   才按时间差补令牌，不需要任何定时任务；
 * - Node 单线程事件循环下 take() 无 await，判断与扣减之间不会被其他请求打断，天然原子；
 * - 用途：IP 桶（配合 LruTokenBucketStore）等单机防滥用场景，跨进程不共享状态。
 */
export class TokenBucket {
    private _tokens: number;
    private _ts: number = 0; // 首次 take 时锚定，避免构造时间与请求时间基准不一致
    public denyCount: number = 0; // 拒绝次数（进程内统计）

    constructor (private readonly _rate: number, private readonly _capacity: number) {
        this._tokens = _capacity;
    }

    /**
     * 取一个令牌：先按毫秒时间差惰性补充，再扣减/拒绝
     *
     * 返回结果语义：
     * - allowed=true：已消费 1 个令牌，remaining 为扣减后的余量；
     * - allowed=false：未消费，retryAfter 为补回 1 个令牌所需秒数（>=1）。
     *
     * @param {number} now - 毫秒时间戳，缺省取系统时间（测试可注入）
     * @return {TokenBucketResult}
     */
    public take(now: number = Date.now()): TokenBucketResult {
        // 首次取令牌：以本次请求时间为基准锚定；令牌初始为满桶（capacity），无需补充
        if (this._ts === 0) {
            this._ts = now;
        } else if (now > this._ts) {
            // 惰性补充：按 (now - _ts) 毫秒差补令牌（rate/秒），封顶 capacity；
            // now <= _ts（时钟回拨）时不补充、也不后退基准，保证基准单调
            this._tokens = Math.min(this._capacity, this._tokens + (now - this._ts) / 1000 * this._rate);
            this._ts = now;
        }
        // 距回满所需秒数（供 X-RateLimit-Reset 使用）
        const reset = Math.max(0, Math.ceil((this._capacity - this._tokens) / this._rate));
        if (this._tokens >= 1) {
            // 有令牌：扣 1
            this._tokens -= 1;
            return {allowed: true, retryAfter: 0, remaining: this._tokens, reset};
        }
        // 无令牌：拒绝并累计进程内统计；等待时间 = 补回 1 个令牌所需毫秒数，向上取整到秒且最小 1
        this.denyCount += 1;
        const waitMs = Math.ceil((1 - this._tokens) / this._rate * 1000);
        return {allowed: false, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)), remaining: this._tokens, reset};
    }
}

/**
 * LRU 桶存储：基于 lru-cache，按 key 懒创建；触达刷新 TTL（空闲 TTL 语义）；
 * 容量上限淘汰最久未用，过期条目自动清理
 */
export class LruTokenBucketStore {
    private readonly _cache: LRUCache<string, TokenBucket>;
    private static readonly DEFAULT_MAX_SIZE = 100000;
    private static readonly DEFAULT_IDLE_TTL_MS = 10 * 60 * 1000;

    constructor(
        private readonly _rate: number,
        private readonly _capacity: number,
        maxSize: number = LruTokenBucketStore.DEFAULT_MAX_SIZE,
        idleTtlMs: number = LruTokenBucketStore.DEFAULT_IDLE_TTL_MS
    ) {
        this._cache = new LRUCache({
            max: maxSize,
            ttl: idleTtlMs,
            ttlAutopurge: true,     // 过期条目自动清理，避免内存残留
            updateAgeOnGet: true    // 触达刷新 TTL，实现“空闲 TTL”语义
        });
    }

    public get rate(): number {
        return this._rate;
    }

    public get capacity(): number {
        return this._capacity;
    }

    /**
     * 取（或懒创建）指定 key 的桶；桶内令牌状态跨请求保留
     *
     * @param {string} key - 桶键（如客户端 IP）
     * @return {TokenBucket}
     */
    public get(key: string): TokenBucket {
        let bucket = this._cache.get(key);
        if (!bucket) {
            bucket = new TokenBucket(this._rate, this._capacity);
            this._cache.set(key, bucket);
        }
        return bucket;
    }
}
