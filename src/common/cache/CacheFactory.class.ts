import {CommonTools, SharingTools} from '../Utility';
import {RedisCache} from './RedisCache.class';
import {ErrorFormat} from '../exception/ErrorFormat';
import {IRedisConfig} from '../../config/cache.config';

export type CACHE_TYPE = 'Redis' | 'Memcached';
export const CACHE_TYPE_REDIS = 'Redis';
export const CACHE_TYPE_MEMCACHE = 'Memcached';
export const CACHE_CLASS_DEFAULT_NAME = 'default';
export const CACHE_CLASS_INSTANCE = 'CACHE_CLASS_%s_%s_%s';    // "CACHE_CLASS_${name}_Redis_0", "CACHE_CLASS_${name}_Memcached_0"

/**
 * Cache Factory 单例
 * 使用方式：
 * 需要使用 cache 的时候，直接使用即可 CacheFactory::instance()->getCache($shardKey);
 */
export class CacheFactory {
    private static _instance: CacheFactory;
    private _initialized: boolean;
    private _cacheType: CACHE_TYPE;
    private _cacheServerCount: number;
    private _cacheServerOptions: Array<IRedisConfig>;
    private _cacheInstance: { [key: string]: RedisCache };
    
    public static instance(): CacheFactory {
        if (CacheFactory._instance == undefined) {
            CacheFactory._instance = new CacheFactory();
        }
        return CacheFactory._instance;
    }
    
    private constructor() {
        this._initialized = false;
    }
    
    /**
     * 游戏启动时，进行初始化
     *
     * @param {CACHE_TYPE} cacheType
     * @param {Array<IRedisConfig>} cacheConfig
     * @param {string} name
     * @return {Promise<void>}
     */
    public async init(cacheType: CACHE_TYPE = CACHE_TYPE_REDIS, cacheConfig: Array<IRedisConfig>, name: string = CACHE_CLASS_DEFAULT_NAME) {
        this._initialized = true;
        this._cacheType = cacheType;
        this._cacheServerCount = cacheConfig.length;
        this._cacheServerOptions = cacheConfig;
        this._cacheInstance = {};
        
        // 测试连接
        const cache = this.getCache(0, cacheType);
        await cache.ping();
    }
    
    /**
     * Get the cache class instance.
     *
     * @param {number} shardKey null given, means use the first cache shard
     * @param {CACHE_TYPE} cacheType  refer to CACHE_TYPE_*
     * @param {string} name
     * @return {RedisCache}
     */
    public getCache(shardKey?: number, cacheType: CACHE_TYPE = CACHE_TYPE_REDIS, name: string = CACHE_CLASS_DEFAULT_NAME): RedisCache {
        if (!cacheType) {
            cacheType = this._cacheType;
        }
        
        // 计算内存中用于保存 CacheInstance 的 KEY 值
        let shardId = SharingTools.getShardId(this._cacheServerCount, shardKey);
        let shardInstanceKey = CommonTools.format(CACHE_CLASS_INSTANCE, name, cacheType, shardId);
        
        if (Object.keys(this._cacheInstance).indexOf(shardInstanceKey) !== -1) {
            // 判断 CacheInstance 的链接状态
            let cache = this._cacheInstance[shardInstanceKey];
            if (cache.connected == false) {
                throw new ErrorFormat(10003);
            }
            return cache;
        } else {
            // 如果 CacheInstance 已经存在，则从内存中取，否则就创建连接。
            switch (cacheType) {
                case CACHE_TYPE_REDIS:
                    this._cacheInstance[shardInstanceKey] = CacheFactory.getRedisCache(this._cacheServerOptions[shardId]);
                    break;
                case CACHE_TYPE_MEMCACHE:
                    throw new ErrorFormat(700001, cacheType);
                default:
                    throw new ErrorFormat(700001, cacheType);
            }
            
            return this._cacheInstance[shardInstanceKey];
        }
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
