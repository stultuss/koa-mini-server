import * as redis from 'redis';
import AbstractCache from './abstract/AbstractCache';
import {ErrorMessage} from '../exception/ErrorMessage';
import {IRedisConfig} from './CacheFactory.class';
import {Logger} from '../Logger';
import {Utils} from '../Utils';

type RedisClient = ReturnType<typeof redis.createClient>;

/**
 * Redis 客户端连接管理装饰器
 */
function Connection() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args: any[]) {
            if (!this._conn || this._connecting) {
                await this.connect();
            }

            if (!this.connected) {
                throw new ErrorMessage(10003);
            }

            try {
                return await originalMethod.apply(this, args);
            } catch (error) {
                if (error.message.includes('Socket already opened')) {
                    // 忽略这个错误，继续执行
                    return await originalMethod.apply(this, args);
                }
                throw error;
            }
        };

        return descriptor;
    };
}

export class RedisCache extends AbstractCache {
    protected _config: IRedisConfig;

    public _conn: RedisClient;
    public _connecting: boolean;
    public _recoverQueue: Array<[string, string, any]>;

    private static readonly MAX_RETRY_ATTEMPTS = 30;
    private static readonly RECONNECT_DELAY = 3000;

    /**
     * Initialize the cache class.
     *
     * @param {IRedisConfig} config
     */
    public constructor(config: IRedisConfig) {
        super();
        this.init(config);
    }

    /**
     * Redis 配置初始化
     *
     * @param {IRedisConfig} config
     */
    protected _connect(config: IRedisConfig) {
        this._config = config;
        this._connecting = false;
        this._recoverQueue = [];
    }

    /**
     * 暴露底层 Redis 客户端连接（供外部 lib 直接使用，如令牌桶）
     *
     * @return {RedisClient}
     */
    public get conn(): RedisClient {
        return this._conn;
    }

    /**
     * 通用 Lua 脚本执行（连接安全：@Connection 自动连接/重连）
     *
     * @param {string} script - Lua 脚本
     * @param {{keys: Array<string>; arguments: Array<string>}} options - KEYS 与 ARGV
     * @return {Promise<any>}
     */
    @Connection()
    public async eval(script: string, options: {keys: Array<string>; arguments: Array<string>}): Promise<any> {
        return await this._conn.eval(script, options);
    }

    /**
     * 创建 Redis 客户端
     *
     * @private
     */
    public async connect(): Promise<void> {

        // 正在连接中，则等待连接完成
        let i = 0;
        while (this._connecting) {
            await Utils.sleep(10);

            // 超过最大重试次数，则抛出异常
            if (i++ > RedisCache.MAX_RETRY_ATTEMPTS) {
                return;
            }
        }

        // 已经创建连接，则不需要等待, 直接返回
        if (!this._connecting && this._conn) {
            return;
        }

        // 返回一个 Promise 对象，等待连接完成
        const self = this;
        return new Promise((resolve, reject) => {
            self._connecting = true;
            self._conn = redis.createClient({
                socket: {
                    host: self._config.host,
                    port: self._config.port,
                    reconnectStrategy: (retries: number) => {
                        self._connected = false;
                        Logger.warn(`[REDIS] reconnect retry ${retries} times...`);
                        return self._config.options.retry_delay || RedisCache.RECONNECT_DELAY;
                    }
                },
                password: self._config.options.password,
                database: self._config.options.db || 0
            });

            // 监听 redis 的错误事件
            self._conn.on('error', (e) => {
                Logger.warn(`[REDIS] connect failed,: ${e.message}`);
                self._connected = false;
                self._connecting = false;
                reject(e);
            });

            // 监听 redis 的连接事件
            self._conn.on('connect', () => {
                Logger.debug(`[REDIS] connect succeed...`);
                self._connected = true;
                self._connecting = false;
                resolve();
            });

            // 监听 redis 的关闭事件
            self._conn.on('end', () => {
                Logger.warn('[REDIS] connection ended');
                self._connected = false;
                self._connecting = false;
                reject(new Error('[REDIS] connection ended'));
            });

            self._conn.connect();
        });
    }

    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* KEYS FUNCTIONS
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * 设置缓存过期时间
     *
     * @param {string} key
     * @param {number} expire
     * @return {Promise<boolean>}
     */
    @Connection()
    public async expire(key: string, expire?: number): Promise<boolean> {
        if (!expire) {
            expire = this.genExpire();
        }
        return await this._conn.expire(key, expire);
    }

    /**
     * 缓存过期操作
     *
     * @param {string} key
     * @return {Promise<boolean>}
     */
    @Connection()
    public async ttl(key: string): Promise<number> {
        if (!this.connected) {
            this._recoverQueue.push(['ttl', key, null]);
            return 0;
        }
        return await this._conn.ttl(key);
    }

    /**
     * 删除缓存
     *
     * @param {string} key
     * @return {Promise<boolean>}
     */
    @Connection()
    public async del(key: string): Promise<number> {
        return await this._conn.del(key);
    }

    /**
     * 测试连接
     *
     * @return {Promise<string>}
     */
    @Connection()
    public async ping(): Promise<boolean> {
        const r = await this._conn.ping();
        return r == 'PONG';
    }

    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* BIT FUNCTIONS
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * 保存二进制数据
     *
     * @param {string} key
     * @param {any} value
     * @param {number} expire
     * @return {Promise<boolean>}
     */
    @Connection()
    public async setBuffer(key: string, value: any, expire?: number): Promise<boolean> {
        const r = await this._conn.set(key, Utils.toBuffer(value));
        await this.expire(key, expire);
        return r == 'OK';
    }

    /**
     * 获取二进制数据
     *
     * @param {string} key
     * @return {Promise<any>}
     */
    @Connection()
    public async getBuffer(key: string): Promise<any> {
        const r = await this._conn.get(key);
        return (Utils.isEmptyValue(r)) ? null : Utils.toBuffer(r);
    }

    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* LOCKER FUNCTIONS
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * 获取分布式锁
     *
     * @param key - 锁的键
     * @param value - 锁的值(通常是请求标识)
     * @param expire - 锁的过期时间(秒)
     */
    @Connection()
    public async lockAcquire(key: string, value: any, expire: number = 30): Promise<boolean> {
        // 使用 SET key value NX EX seconds 实现原子操作
        const r = await this._conn.set(key, this._encodeValue(value), {NX: true, EX: expire});
        return r === 'OK';
    }

    /**
     * 释放分布式锁
     *
     * @param key - 锁的键
     * @param value - 锁的值(必须与加锁时的值相同)
     */
    @Connection()
    public async lockRelease(key: string, value: any): Promise<boolean> {
        // 使用 Lua 脚本确保原子性
        const script = `
            if redis.call("get",KEYS[1]) == ARGV[1] then
                return redis.call("del",KEYS[1])
            else
                return 0
            end
        `;

        const r = await this._conn.eval(script, {keys: [key], arguments: [this._encodeValue(value)]});
        return r === 1;
    }

    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* STRING FUNCTIONS
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * redis.incr
     *
     * @param {string} key
     * @param {number} expire
     * @return {Promise<number>}
     */
    @Connection()
    public async incr(key: string, expire?: number): Promise<number> {
        const r = await this._conn.incr(key);
        await this.expire(key, expire);
        return r;
    }

    /**
     * redis.incrby
     *
     * @param {string} key
     * @param {number} value
     * @param {number} expire
     * @return {Promise<number>}
     */
    @Connection()
    public async incrby(key: string, value: number, expire?: number): Promise<number> {
        const r = await this._conn.incrBy(key, value);
        await this.expire(key, expire);
        return r;
    }

    /**
     * redis.get
     *
     * @param {string} key
     * @return {Promise<string>}
     */
    @Connection()
    public async get(key: string): Promise<any> {
        const r = await this._conn.get(key);
        if (Utils.isEmptyValue(r)) {
            return null;
        }
        return this._decodeValue(r);
    }

    /**
     * redis.set
     *
     * @param {string} key
     * @param {any} value
     * @param {number} expire
     * @param {boolean} needEncode
     * @return {Promise<boolean>}
     */
    @Connection()
    public async set(key: string, value: any, expire?: number, needEncode: boolean = true): Promise<boolean> {
        const r = await this._conn.set(key, (needEncode) ? this._encodeValue(value) : value);
        await this.expire(key, expire);
        return (r == 'OK');
    }

    /**
     * redis.mGet
     *
     * @param {Array<string>} keys
     * @return {Promise<any[]>}
     */
    @Connection()
    public async mGet(keys: Array<string>): Promise<any[]> {
        if (Utils.isEmptyValue(keys)) {
            return null;
        }

        const r = await this._conn.mGet(keys);
        if (Utils.isEmptyValue(r)) {
            return null;
        }

        return r.map((v) => (v == null) ? undefined : this._decodeValue(v));
    }

    /**
     * redis.mSet
     *
     * @param {Object} obj
     * @param {number} expire
     * @return {Promise<boolean>}
     */
    @Connection()
    public async mSet(obj: { [key: string]: any }, expire?: number): Promise<boolean> {
        if (Utils.isEmptyValue(obj)) {
            return null;
        }

        const items: Array<string> = [];
        for (const key of Object.keys(obj)) {
            items.push(key);
            items.push(this._encodeValue(obj[key]));
        }

        const r = await this._conn.mSet(items);
        for (const key of Object.keys(obj)) {
            await this.expire(key, expire);
        }

        return r == 'OK';
    }

    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* HASH FUNCTIONS
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * redis.hGetAll
     *
     * @param {string} key
     * @return {Promise<Object>}
     */
    @Connection()
    public async hGetAll(key: string): Promise<{ [key: string]: any }> {
        const r = await this._conn.hGetAll(key);
        if (Utils.isEmptyValue(r)) {
            return null;
        }
        const obj = {};
        for (const [k, v] of Object.entries(r)) {
            obj[k] = this._decodeValue(v);
        }
        return obj;
    }

    /**
     * redis.hGet
     *
     * @param {string} key
     * @param {number | string} field
     * @return {Promise<Object>}
     */
    @Connection()
    public async hGet(key: string, field: number | string): Promise<any> {
        const r = await this._conn.hGet(key, String(field));
        if (Utils.isEmptyValue(r)) {
            return null;
        }
        return this._decodeValue(r);
    }

    /**
     * redis.hSet
     *
     * @param {string} key
     * @param {number | string} field
     * @param value
     * @param {number} expire
     * @return {Promise<boolean>}
     */
    @Connection()
    public async hSet(key: string, field: number | string, value: any, expire?: number): Promise<number> {
        const r = await this._conn.hSet(key, String(field), this._encodeValue(value));
        await this.expire(key, expire);
        return r;
    }

    /**
     * redis.hincrby
     *
     * @param {string} key
     * @param {number | string} field
     * @param {number} value
     * @param {number} expire
     * @return {Promise<number>}
     */
    @Connection()
    public async hincrby(key: string, field: number | string, value: number, expire?: number): Promise<number> {
        const r = await this._conn.hIncrBy(key, String(field), value);
        await this.expire(key, expire);
        return r;
    }

    /**
     * redis.hMGet
     *
     * @param {string} key
     * @param {Array<number | string>} fields
     * @return {Promise<[key: string]: any>}
     */
    @Connection()
    public async hMGet(key: string, fields: Array<any>): Promise<{ [key: string]: any }> {
        if (Utils.isEmptyValue(fields) || Array.isArray(fields) == false) {
            return null;
        }

        const r = await this._conn.hmGet(key, fields);
        if (Utils.isEmptyValue(r)) {
            return null;
        }

        const obj = {};
        for (const [k, v] of Object.entries(fields)) {
            obj[v] = this._decodeValue(r[k]);
        }

        return obj;
    }

    /**
     * redis.hMSet
     *
     * @param {string} key
     * @param {Record<string, any>} obj
     * @param {number} expire
     * @return {Promise<boolean>}
     */
    @Connection()
    public async hMSet(key: string, obj: Record<string, any>, expire?: number): Promise<number> {
        if (Utils.isEmptyValue(obj)) {
            return null;
        }

        const items: { [key: string]: any } = {};
        for (const key of Object.keys(obj)) {
            items[key] = this._encodeValue(obj[key]);
        }

        const r = await this._conn.hSet(key, items);
        if (Utils.isEmptyValue(r)) {
            return 0;
        }

        await this.expire(key, expire);
        return r;
    }

    /**
     * 获取版本号（用于缓存一致性 CAS）
     *
     * @param {string} key
     * @return {Promise<number>}
     */
    @Connection()
    public async getVersion(key: string): Promise<number> {
        const r = await this._conn.get(key);
        return (Utils.isEmptyValue(r)) ? 0 : Number(r);
    }

    /**
     * 版本号 +1（写操作后调用，使在途读请求的 CAS 失败）
     *
     * @param {string} key
     * @return {Promise<number>}
     */
    @Connection()
    public async incrVersion(key: string): Promise<number> {
        return await this._conn.incr(key);
    }

    /**
     * 版本号匹配才写入单个 hash 字段（Lua CAS，防止并发读把旧值写回缓存）
     *
     * @param {string} key
     * @param {number | string} field
     * @param value
     * @param {string} versionKey
     * @param {number | string} expectedVersion
     * @return {Promise<boolean>}
     */
    @Connection()
    public async hSetIfVersion(key: string, field: number | string, value: any, versionKey: string, expectedVersion: number | string): Promise<boolean> {
        const script = `
            local v = redis.call('get', KEYS[2]) or '0'
            if v == ARGV[1] then
                redis.call('hset', KEYS[1], ARGV[2], ARGV[3])
                return 1
            end
            return 0
        `;
        const r = await this._conn.eval(script, {
            keys: [key, versionKey],
            arguments: [String(expectedVersion), String(field), this._encodeValue(value)]
        });

        if (r === 1) {
            await this.expire(key);
            return true;
        }
        return false;
    }

    /**
     * 版本号匹配才批量写入 hash（Lua CAS，防止并发读把旧值写回缓存）
     *
     * @param {string} key
     * @param {Record<string, any>} obj
     * @param {string} versionKey
     * @param {number | string} expectedVersion
     * @return {Promise<boolean>}
     */
    @Connection()
    public async hMSetIfVersion(key: string, obj: Record<string, any>, versionKey: string, expectedVersion: number | string): Promise<boolean> {
        if (Utils.isEmptyValue(obj)) {
            return true;
        }

        const script = `
            local v = redis.call('get', KEYS[2]) or '0'
            if v == ARGV[1] then
                local i = 2
                while i <= #ARGV do
                    redis.call('hset', KEYS[1], ARGV[i], ARGV[i + 1])
                    i = i + 2
                end
                return 1
            end
            return 0
        `;

        const args: Array<string> = [String(expectedVersion)];
        for (const field of Object.keys(obj)) {
            args.push(String(field), this._encodeValue(obj[field]));
        }

        const r = await this._conn.eval(script, {
            keys: [key, versionKey],
            arguments: args
        });

        if (r === 1) {
            await this.expire(key);
            return true;
        }
        return false;
    }

    /**
     * redis.hDel
     *
     * @param {string} key
     * @param {string  | string[]} fields
     * @return {Promise<boolean>}
     */
    @Connection()
    public async hDel(key: string, fields: string | string[]): Promise<number> {
        if (!fields) {
            return 0;
        }
        return await this._conn.hDel(key, fields);
    }

    /**
     * redis.hLen
     *
     * @param {string} key
     * @return {Promise<number>}
     */
    @Connection()
    public async hLen(key: string): Promise<number> {
        return await this._conn.hLen(key);
    }

    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* SortedSet FUNCTIONS
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * 添加一个 member 和 score 到排行
     *
     * @param {string} key
     * @param {number} score
     * @param {string | number} member
     * @param {number} expire
     * @return {Promise<number>}
     */
    @Connection()
    public async zadd(key: string, score: number, member: string | number, expire?: number): Promise<number> {
        const r = await this._conn.zAdd(key, {
            score: score,
            value: String(member)
        });
        await this.expire(key, expire);
        return r;
    }

    /**
     * 返回排行长度
     *
     * @param {string} key
     * @return {Promise<number>}
     */
    @Connection()
    public async zcard(key: string): Promise<number> {
        return await this._conn.zCard(key);
    }

    /**
     * 返回排行中，指定 score 区间内的成员数量
     *
     * @param {string} key
     * @param {number} minScore
     * @param {number} maxScore
     * @return {Promise<number>}
     */
    @Connection()
    public async zcount(key: string, minScore: number, maxScore: number): Promise<number> {
        return await this._conn.zCount(key, minScore, maxScore);
    }

    /**
     * 给排行中的 member 的 score 增加 increment 值
     *
     * @param {string} key
     * @param {number} increment
     * @param {string | number} member
     * @param {number} expire
     * @return {Promise<number>}
     */
    @Connection()
    public async zincrby(key: string, increment: number, member: string | number, expire?: number): Promise<number> {
        const r = await this._conn.zIncrBy(key, increment, String(member));
        await this.expire(key, expire);
        return r;
    }

    /**
     * 返回成员的 score
     *
     * @param {string} key
     * @param {string | number} member
     * @return {Promise<number>}
     */
    @Connection()
    public async zscore(key: string, member: string | number): Promise<number> {
        const score = await this._conn.zScore(key, String(member));
        return Math.floor(score);
    }

    /**
     * 返回排行中成员 member 的排名（从小到大，score 越小排名越高）
     *
     * @param {string} key
     * @param {string | number} member
     * @return {Promise<number>}
     */
    @Connection()
    public async zrank(key: string, member: string | number): Promise<number> {
        return await this._conn.zRank(key, String(member));
    }

    /**
     * 返回排行中成员 member 的排名（从大到小，score 越大排名越高）
     *
     * @param {string} key
     * @param {string | number} member
     * @return {Promise<number>}
     */
    @Connection()
    public async zrevrank(key: string, member: string | number): Promise<number> {
        return await this._conn.zRevRank(key, String(member));
    }

    /**
     * 返回排行中，指定排序区间内的成员。(从小到大)
     *
     * @param {string} key
     * @param {number} start
     * @param {number} stop
     * @param {boolean} withScores
     * @return {Promise<string[]>}
     */
    @Connection()
    public async zrange(key: string, start: number, stop: number, withScores: boolean = false): Promise<any[]> {
        if (!withScores) {
            return await this._conn.zRange(key, start, stop);
        } else {
            return await this._conn.zRangeWithScores(key, start, stop);
        }
    }

    /**
     * 返回排行中，指定 score 区间内的成员。(从小到大)
     *
     * @param {string} key
     * @param {number} min
     * @param {number} max
     * @param {boolean} withScores
     * @return {Promise<string[]>}
     */
    @Connection()
    public async zrangebyscore(key: string, min: number, max: number, withScores: boolean = false): Promise<any[]> {
        if (!withScores) {
            return await this._conn.zRangeByScore(key, min, max);
        } else {
            return await this._conn.zRangeByScoreWithScores(key, min, max);
        }
    }

    /**
     * 返回排行中，指定排序区间内的成员。(从大到小)
     *
     * @param {string} key
     * @param {number} start
     * @param {number} stop
     * @param {boolean} withScores
     * @return {Promise<string[]>}
     */
    @Connection()
    // public async zrevrange(key: string, start: number, stop: number, withScores: boolean = false): Promise<any[]> {
    //     if (!withScores) {
    //         return await this._conn.zRevRange(key, start, stop);
    //     } else {
    //         return await this._conn.zRevRangeWithScores(key, start, stop);
    //     }
    // }

    /**
     * 返回排行中，指定排序区间内的成员。(从大到小)
     *
     * @param {string} key
     * @param {number} max
     * @param {number} min
     * @param {boolean} withScores
     * @return {Promise<string[]>}
     */
    @Connection()
    // public async zrevrangebyscore(key: string, max: number, min: number, withScores: boolean = false): Promise<any[]> {
    //     if (!withScores) {
    //         return await this._conn.zRevRangeByScore(key, max, min);
    //     } else {
    //         return await this._conn.zRevRangeByScoreWithScores(key, max, min);
    //     }
    // }

    /**
     * 从排行中移除一个 member
     *
     * @param {string} key
     * @param {string | number} member
     * @return {Promise<number>}
     */
    @Connection()
    public async zrem(key: string, member: string | number): Promise<number> {
        return await this._conn.zRem(key, String(member));
    }

    /**
     * 移除排行 key 中，指定排名(rank)区间内的所有成员。
     *
     * @param {string} key
     * @param {number} start
     * @param {number} stop
     * @return {Promise<number>}
     */
    @Connection()
    public async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
        return await this._conn.zRemRangeByRank(key, start, stop);
    }

    /**
     * 移除排行 key 中，指定排名(score)区间内的所有成员。
     *
     * @param {string} key
     * @param {number} min
     * @param {number} max
     * @return {Promise<number>}
     */
    @Connection()
    public async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
        return await this._conn.zRemRangeByScore(key, min, max);
    }

    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* Set FUNCTIONS
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * 添加一个 member 到集合
     *
     * @param {string} key
     * @param {any} member
     * @param {number} expire
     * @return {Promise<number>}
     */
    @Connection()
    public async sadd(key: string, member: any | any[], expire?: number): Promise<number> {
        const members = [];

        if (!Array.isArray(member)) {
            members.push(this._encodeValue(member));
        } else {
            member.map((v) => members.push(this._encodeValue(v)));
        }

        if (members.length == 0) {
            return 0;
        }

        const r = await this._conn.sAdd(key, [...Array.from(members)]);
        await this.expire(key, expire);
        return r;
    }

    /**
     * 返回集合长度
     *
     * @param {string} key
     * @return {Promise<number>}
     */
    @Connection()
    public async scard(key: string): Promise<number> {
        return await this._conn.sCard(key);
    }

    /**
     * 随机返回一个 member，并从集合中删除
     *
     * @param {string} key
     * @return {Promise<number>}
     */
    @Connection()
    public async spop(key: string): Promise<any> {
        const r = await this._conn.sPop(key);
        if (Utils.isEmptyValue(r)) {
            return null;
        }
        return this._decodeValue(r);
    }

    /**
     * 随机返回 member
     *
     * @param {string} key
     * @return {Promise<any>}
     */
    @Connection()
    public async srandmember(key: string): Promise<any> {
        const r = await this._conn.sRandMember(key);
        if (Utils.isEmptyValue(r)) {
            return null;
        }
        return this._decodeValue(r);
    }

    /**
     * 删除一个 member
     *
     * @param {string} key
     * @param {any} member
     * @return {Promise<number>}
     */
    @Connection()
    public async srem(key: string, member: any): Promise<number> {
        return await this._conn.sRem(key, this._encodeValue(member));
    }

    /**
     * 判断 member 是否存在
     *
     * @param {string} key
     * @param {any} member
     * @return {Promise<boolean>}
     */
    @Connection()
    public async sismember(key: string, member: any): Promise<boolean> {
        return await this._conn.sIsMember(key, this._encodeValue(member));
    }

    /**
     * 列出所有 member
     *
     * @param {string} key
     * @return {Promise<any[]>}
     */
    @Connection()
    public async smembers(key: string): Promise<any[]> {
        const r = await this._conn.sMembers(key);
        if (Utils.isEmptyValue(r)) {
            return [];
        }
        return r.map((v: any) => this._decodeValue(v));
    }

    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* List FUNCTIONS
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * 返回列表长度
     *
     * @param {string} key
     * @param {number} start
     * @param {number} stop
     * @return {Promise<any[]>}
     */
    @Connection()
    public async lrange(key: string, start: number, stop: number): Promise<any[]> {
        const r = await this._conn.lRange(key, start, stop);
        if (Utils.isEmptyValue(r)) {
            return [];
        }
        return r.map((v: any) => this._decodeValue(v));
    }

    /**
     * 返回列表长度
     *
     * @param {string} key
     * @return {Promise<number>}
     */
    @Connection()
    public async llen(key: string): Promise<number> {
        return await this._conn.lLen(key);
    }

    /**
     * 移除并返回列表 key 的头元素。
     *
     * @param {string} key
     * @return {Promise<any>}
     */
    @Connection()
    public async lpop(key: string): Promise<any> {
        const r = await this._conn.lPop(key);
        if (Utils.isEmptyValue(r)) {
            return null;
        }
        return this._decodeValue(r);
    }

    /**
     * 将一个 value 插入到列表 key 的表头
     *
     * @param {string} key
     * @param {any} value
     * @param {number} expire
     * @return {Promise<number>}
     */
    @Connection()
    public async lpush(key: string, value: any, expire?: number): Promise<number> {
        const r = await this._conn.lPush(key, this._encodeValue(value));
        await this.expire(key, expire);
        return r;
    }

    /**
     * 将一个 value 插入到列表 key 的表尾。
     *
     * @param {string} key
     * @param {any} value
     * @param {number} expire
     * @return {Promise<number>}
     */
    @Connection()
    public async rpush(key: string, value: any, expire?: number): Promise<number> {
        const r = await this._conn.rPush(key, this._encodeValue(value));
        await this.expire(key, expire);
        return r;
    }

    /**
     * 对一个列表进行修剪(trim)，就是说，让列表只保留指定区间内的元素，不在指定区间之内的元素都将被删除。
     *
     * @param {string} key
     * @param {number} start
     * @param {number} end
     * @return {Promise<string>}
     */
    @Connection()
    public async ltrim(key: string, start: number, end: number): Promise<string> {
        return await this._conn.lTrim(key, start, end);
    }
}
