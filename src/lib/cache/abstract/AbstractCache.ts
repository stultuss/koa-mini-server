import {JsonTools} from '../../tools/JsonTools';
import {RandomTools} from '../../tools/RandomTools';

/**
 * default expire time, in seconds
 * default is 1296000 = 2 weeks
 *
 * @type {number}
 */
export const CACHE_EXPIRE: number = 1296000;

/**
 * max % variance in actual expiration time <br/>
 *
 * <pre>
 * max variance (in percent) in expiration of cache.
 * Thus, for a variance of 10 if an expiration time of 100 seconds is specified,
 * the item will actually expire in 100-110 seconds (selected randomly).
 * Designed to prevent mass simultaneous expiration of cache objects.
 * </pre>
 *
 * @type {number}
 */
export const CACHE_VARIANCE: number = 10;

export default abstract class AbstractCache {
    /**
     * Cache 链接状态
     */
    protected _connected: boolean;
    public get connected(): boolean {
        return this._connected;
    }

    /**
     * Cache Constructor
     */
    protected constructor() {
        // do nothing
    }

    /**
     * Initialize the cache class.
     *
     * @param {Object} config
     */
    protected init(config: Object): void {
        this._connected = false;
        this._connect(config);
    }

    /**
     * Connect to the cache server.
     *
     * @param {Object} config
     * @private
     */
    protected abstract _connect(config: Object): void;

    /**
     * Generate an expire time with variance calculated in it.
     *
     * Example:
     * const cache = new Cache(options);
     * const expire = cache.genExpire(3600); // 1小时 + 10%
     * 实际过期时间范围: 3600-3960秒
     *
     * @param {number} expires in seconds, default null, means use system default expire time
     * @return {number}
     * @private
     */
    public genExpire(expires?: number): number {
        expires = expires || CACHE_EXPIRE;

        // 计算随机范围
        // variance范围: [0, +variance%]
        // 例如: 过期时间100秒，CACHE_VARIANCE=10，则实际过期时间为100-110秒
        const varianceRange = expires * 0.01 * CACHE_VARIANCE;
        const minVariance = Math.max(1, varianceRange); // 确保最小有1秒的随机范围

        // 为了避免同一时间 redis 大量缓存过期，导致业务中大量出现将数据重新保存 redis 中，所以每个缓存都应当增加一个随机值
        return Math.floor(expires + RandomTools.getRandomFromRange(0, minVariance));
    }

    /**
     * Encode inputted value into string format.
     *
     * @param {Object} value
     * @return {string}
     */
    protected _encodeValue(value: any): string {
        /**
         * boolean: "['encode', true]"
         * number:  "['encode', 1]"
         * null:    "['encode', null]"
         * object:  "['encode', {"name":"david"}]"
         * array:   "['encode', [1,2,3]]"
         * string:  "['encode', "string"]"
         */
        return JsonTools.stringify(['encode', value]);
    }

    /**
     * Decode value into array or other mixed type.
     *
     * @param {any} v
     * @return {string}
     */
    protected _decodeValue(v: any): any {
        if (v === undefined || v === null || Number.isNaN(v)) {
            return v;
        }

        // 如果不是字符串，直接返回
        const value = String(v);
        if (typeof v !== 'string') {
            return v;
        }

        // 只有 json string 才需要解析 json，如果解析失败，直接透传。
        try {
            let decodeValue = JSON.parse(value);
            // 只有结构 Array，并且只有长度等于2，并且第一个元素是 encode 的情况下，说明是 encodeValue 塞到 redis 中的。
            if (Array.isArray(decodeValue) && decodeValue.length == 2 && decodeValue[0] == 'encode') {
                decodeValue = decodeValue.pop();
            }
            return decodeValue;
        } catch (e) {
            return value;
        }
    }
}
