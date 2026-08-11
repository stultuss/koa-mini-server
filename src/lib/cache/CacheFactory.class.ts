import {RedisCache} from './RedisCache.class';
import {ErrorMessage} from '../exception/ErrorMessage';
import {ShardingTools} from '../tools/ShardingTools';
import {Utils} from '../Utils';

export type CACHE_TYPE = 'Redis' | 'Memcached';
export const CACHE_TYPE_REDIS = 'Redis';
export const CACHE_TYPE_MEMCACHED = 'Memcached';
export const CACHE_CLASS_DEFAULT_NAME = 'default';
export const CACHE_CLASS_INSTANCE = 'CACHE_CLASS_%s_%s_%s';    // "CACHE_CLASS_${name}_Redis_0", "CACHE_CLASS_${name}_Memcached_0"
export type ICacheClient = RedisCache

export interface IRedisConfig {
    port: number,
    host: string,
    options: {
        connect_timeout: number, // redis 服务断开重连超时时间
        retry_delay: number, // redis 服务断开，每隔多少时间重连
        password?: string | null,
        db?: number,
        retry_strategy?: (retries: number) => number | Error;
    }
}

/**
 * Cache Factory 单例
 * 使用方式：
 * 需要使用 cache 的时候，直接使用即可 CacheFactory::instance()->getCache(shardValue);
 */
export class CacheFactory {
    private static _instance: CacheFactory;
    private _initialized: boolean;
    private _cacheType: CACHE_TYPE;
    private _cacheServerCount: number;
    private _cacheServerOptions: Array<IRedisConfig>;
    private _cacheInstance: { [key: string]: RedisCache };

    private constructor() {
        this._initialized = false;
    }

    public static instance(): CacheFactory {
        if (CacheFactory._instance == undefined) {
            CacheFactory._instance = new CacheFactory();
        }
        return CacheFactory._instance;
    }

    /**
     * 游戏启动时，进行初始化
     *
     * @param {CACHE_TYPE} cacheType
     * @param {Array<IRedisConfig>} cacheConfig
     * @param {string} name
     * @return {Promise<void>}
     */
    public async init(cacheType: CACHE_TYPE = CACHE_TYPE_REDIS, cacheConfig: Array<IRedisConfig>, name: string = CACHE_CLASS_DEFAULT_NAME): Promise<void> {
        // 避免重复初始化
        if (this._initialized) {
            return;
        }

        this._cacheType = cacheType;
        this._cacheServerCount = cacheConfig.length;
        this._cacheServerOptions = cacheConfig;
        this._cacheInstance = {};
        this._initialized = true;
    }

    /**
     * Get the cache class instance.
     *
     * @param {number} shardValue null given, means use the first cache shard
     * @param {CACHE_TYPE} cacheType  refer to CACHE_TYPE_*
     * @param {string} name
     * @return {RedisCache}
     */
    public getCache(shardValue?: string | number, cacheType: CACHE_TYPE = CACHE_TYPE_REDIS, name: string = CACHE_CLASS_DEFAULT_NAME): RedisCache {

        if (!this._initialized) {
            throw new ErrorMessage(10000, 'CacheFactory not initialized yet');
        }

        if (!cacheType) {
            cacheType = this._cacheType;
        }

        // 计算内存中用于保存 CacheInstance 的 KEY 值
        const shardId = ShardingTools.getShardId({count: this._cacheServerCount, value: shardValue});
        const shardInstanceKey = Utils.format(CACHE_CLASS_INSTANCE, name, cacheType, shardId);

        // 获取缓存中的 CacheInstance, 如果不存在则创建后保存到缓存中
        if (!this._cacheInstance.hasOwnProperty(shardInstanceKey)) {
            switch (cacheType) {
                case CACHE_TYPE_REDIS:
                    this._cacheInstance[shardInstanceKey] = CacheFactory.getRedisCache(this._cacheServerOptions[shardId]);
                    break;
                case CACHE_TYPE_MEMCACHED:
                    throw new ErrorMessage(10021, cacheType);
                default:
                    throw new ErrorMessage(10021, cacheType);
            }
        }

        return this._cacheInstance[shardInstanceKey];
    }

    /**
     * Initialize Redis Cache
     *
     * @param {IRedisConfig} config
     * @return {RedisCache}
     */
    protected static getRedisCache(config: IRedisConfig): RedisCache {
        return new RedisCache(config);
    }
}
