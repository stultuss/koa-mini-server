export class System {
    private static _instance: System;
    private _cache: { [key: string]: any } = {};

    public static instance(): System {
        if (System._instance == undefined) {
            System._instance = new System();
        }
        return System._instance;
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
     * 设置系统级缓存
     *
     * @param {string} key
     * @param {any} value
     */
    public cache(key: string, value: any = null): any {
        if (value !== null) {
            this._cache[key] = value;
        }
        return this._cache[key];
    }

    /**
     * 清除系统级缓存
     *
     * @param {string} key
     */
    public clear(key: string): any {
        delete (this._cache[key]);
    }
}