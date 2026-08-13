import {LRUCache} from 'lru-cache';

/**
 * 系统级缓存，分两层：
 * - LRU 缓存（可重建数据）：有界 + 空闲 TTL 自动过期，容量超限淘汰最久未用；
 * - 持久容器（不可丢失/不可重建数据）：普通 Map，进程内保活，不淘汰不过期。
 *
 * 注意：持久容器仅进程内保活；需要跨进程/跨重启持久化请走 Redis（RedisCache）。
 *
 * API：
 * - cache(key) 读 / cache(key, value) 写（LRU，value !== null 才写）/ clear(key) 删
 * - persist(key, value) 写 / getPersistent(key) 读 / clearPersistent(key) 删（持久容器）
 */
export class System {
    private static _instance: System;
    private readonly _cache: LRUCache<string, any>;
    private readonly _persistent: Map<string, any>;
    private static readonly CACHE_MAX = 10000;              // 容量上限（条目数）
    private static readonly CACHE_TTL_MS = 10 * 60 * 1000;  // 空闲 TTL（触达刷新）

    public static instance(): System {
        if (System._instance == undefined) {
            System._instance = new System();
        }
        return System._instance;
    }

    private constructor() {
        this._cache = new LRUCache({
            max: System.CACHE_MAX,
            ttl: System.CACHE_TTL_MS,
            ttlAutopurge: true,     // 过期条目自动清理，避免内存残留
            updateAgeOnGet: true    // 触达刷新 TTL，实现“空闲 TTL”语义
        });
        this._persistent = new Map<string, any>();
    }

    /**
     * 设置定时器
     *
     * @param {number} timeout
     * @param {Function} cb
     */
    public runTimer(cb: () => void, timeout: number) {
        setTimeout(async () => {
            // 容错处理
            try {
                cb();
            } catch (e) {
                console.log(e);
            }
            this.runTimer(cb, timeout);
        }, timeout);
    }

    /**
     * 读写系统级缓存：传 value（且非 null）为写，否则为读
     *
     * @param {string} key
     * @param {any} value
     * @return {any} 读时返回缓存值（未命中 undefined）；写时返回刚写入的值
     */
    public cache(key: string, value: any = null): any {
        if (value !== null) {
            this._cache.set(key, value);
        }
        return this._cache.get(key);
    }

    /**
     * 清除系统级缓存
     *
     * @param {string} key
     */
    public clear(key: string): void {
        this._cache.delete(key);
    }

    /**
     * 写入持久容器（进程内保活，不淘汰不过期；可存任意值，包括 null）
     *
     * @param {string} key
     * @param {any} value
     */
    public persist(key: string, value: any): void {
        this._persistent.set(key, value);
    }

    /**
     * 读取持久容器（未命中返回 undefined）
     *
     * @param {string} key
     * @return {any}
     */
    public getPersistent(key: string): any {
        return this._persistent.get(key);
    }

    /**
     * 删除持久容器条目
     *
     * @param {string} key
     */
    public clearPersistent(key: string): void {
        this._persistent.delete(key);
    }
}
