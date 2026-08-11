import * as http from 'http';
import * as util from 'util';
import * as os from 'os';
import {CryptoTools} from './tools/CryptoTools';

export class Utils {
    /**
     * 检查值是否为空
     *
     * @param value
     */
    public static isEmpty(value: any): boolean {
        if (typeof value === 'string') return !value.trim();
        if (typeof value === 'number') return Number.isNaN(value);
        return !value;
    }

    /**
     * 兼容 underscore.isEmpty 语义：null/undefined、空字符串、空数组、
     * 空 Buffer、无自有属性的对象/数值等均视为空
     *
     * @param value
     */
    public static isEmptyValue(value: any): boolean {
        if (value == null) return true;
        if (typeof value === 'string' || Array.isArray(value) || Buffer.isBuffer(value)) {
            return value.length === 0;
        }
        return Object.keys(value).length === 0;
    }

    /**
     * 浮点数处理
     *
     * @param num
     * @param precision
     */
    public static strip(num: number, precision = 12) {
        return +parseFloat(num.toFixed(precision));
    }

    /**
     * To Buffer
     *
     * @param value
     * @returns
     */
    public static toBuffer(value: any): Buffer {
        if (Buffer.isBuffer(value)) {
            return value;
        }

        if (typeof value === 'string') {
            return Buffer.from(value, 'utf8');
        }

        if (value instanceof Uint8Array) {
            return Buffer.from(value);
        }

        if (typeof value === 'object') {
            return Buffer.from(JSON.stringify(value));
        }

        return Buffer.from(String(value));
    }

    /**
     * 使当前执行的代码暂停指定的毫秒数。
     *
     * 该方法通过创建一个 Promise，在指定的毫秒数后解析，从而实现代码的暂停。
     * 它可以用于模拟延迟、控制异步操作的执行顺序等场景。
     *
     * @param {number} ms - 需要暂停的毫秒数。
     * @returns {Promise<void>} 一个 Promise，在指定的毫秒数后解析。
     */
    public static async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * 从 HTTP 请求中获取客户端的 IP 地址。
     *
     * 该方法会依次尝试从请求头中的 'x-real-ip'、'x-forwarded-for' 获取 IP 地址，
     * 如果请求头中没有相关信息，则尝试从请求的连接或套接字对象中获取远程 IP 地址。
     *
     * @param {http.IncomingMessage} req - HTTP 请求对象。
     * @returns {string} 客户端的 IP 地址，如果未找到则返回 undefined。
     */
    public static getIP(req: http.IncomingMessage): string | undefined {
        if (!req) {
            return undefined;
        }

        if (req.headers['x-real-ip']) {
            return String(req.headers['x-real-ip']);
        }

        if (req.headers['x-forwarded-for'] && typeof req.headers['x-forwarded-for'] == 'string') {
            return String(req.headers['x-forwarded-for']).split(',')[0];
        }

        if (req.socket && req.socket.remoteAddress) {
            return req.socket.remoteAddress;
        }

        if (req.connection && req.connection.remoteAddress) {
            return req.connection.remoteAddress;
        }
    }

    /**
     * 生成一个经过 MD5 加密的字符串。
     *
     * 该方法接收三个参数，将它们用逗号连接成一个字符串，然后使用 CryptoTools 工具类的 md5 方法对其进行 MD5 加密。
     * 第三个参数有默认值 0，若不传入该参数，则使用默认值。
     *
     * @param {string | number} key1 - 第一个键值，可以是字符串或数字。
     * @param {string | number} key2 - 第二个键值，可以是字符串或数字。
     * @param {string | number} key3 - 第三个键值，可以是字符串或数字，默认为 0。
     * @returns {string} 返回经过 MD5 加密后的字符串。
     */
    public static genString(key1: string | number, key2: string | number, key3: string | number = 0): string {
        return CryptoTools.md5(`${key1},${key2},${key3}`);
    }

    /**
     * 生成一个从起始值到结束值的数字数组，数组元素按照指定间隔递增。
     *
     * 该方法会创建一个包含从 `start` 到 `end`（包含 `end`）的数字数组，
     * 数组中相邻元素的差值为 `interval`。如果未提供 `interval`，则默认间隔为 1。
     *
     * @param {number} start - 数组的起始值。
     * @param {number} end - 数组的结束值，包含在数组中。
     * @param {number} interval - 数组元素之间的间隔，默认为 1。
     * @returns {number[]} 返回一个包含指定范围内数字的数组。
     */
    public static range(start: number, end: number, interval: number = 1): number[] {
        const list = [];
        for (let i = start; i <= end; i += interval) {
            list.push(i);
        }
        return list;
    }

    /**
     * 对对象数组进行排序
     *
     * 该函数根据指定的字段对对象数组进行排序，可以选择升序或降序。
     * 如果对象中不存在指定的字段，降序时默认值为 0，升序时默认值为 Infinity。
     *
     * @param {Object[]} list - 要排序的对象数组。
     * @param {string} field - 用于排序的字段名。
     * @param {boolean} desc - 是否降序排列，默认为 true（降序）。
     * @return {Object[]} 排序后的对象数组。
     */
    public static sort(list: Object[], field: string, desc: boolean = true): Object[] {
        return list.sort((a, b) => {
            const anum = a[field] == null ? (desc ? 0 : Infinity) : a[field];
            const bnum = b[field] == null ? (desc ? 0 : Infinity) : b[field];
            if ((desc && anum > bnum) || (!desc && anum < bnum)) {
                return -1;
            }
            return (anum === bnum) ? 0 : 1;
        });
    }

    /**
     * 填充字符串
     *
     * 该函数用于在给定的字符串或数字前填充指定的字符，使其达到指定的长度。
     * 如果给定的字符串或数字长度已经达到或超过指定长度，则直接返回原字符串。
     *
     * @param {string | number} str - 要填充的字符串或数字。
     * @param {number} length - 填充后字符串应达到的长度。
     * @param {string} context - 用于填充的字符，默认为 '0'。
     * @returns {string} 填充后的字符串。
     */
    public static padding(str: string | number, length: number, context: string = '0'): string {
        const numLength = String(str).length;
        const paddingLen = (length > numLength) ? length - numLength + 1 || 0 : 0;
        return Array(paddingLen).join(context) + str;
    }

    /**
     * 根据当前时间和上次资源充电时间定期刷新生成的资源。
     *
     * 该函数会计算从上次充电时间到请求时间内资源可恢复的次数，
     * 并根据恢复次数和每次恢复的资源量更新资源值。
     * 如果资源恢复后超过了上限，则将资源值设置为上限。
     * 最后返回更新后的资源值和上次充电时间。
     *
     * @param {number} resource - 当前资源量。
     * @param {number} lastChargedTime - 上次资源充电的时间戳。
     * @param {number} limit - 资源的上限。
     * @param {number} recoveryInterval - 资源恢复的时间间隔，单位为时间戳。
     * @param {number} recoveryAmount - 每次资源恢复的量。
     * @param {number} reqTime - 请求刷新资源的时间戳。
     * @returns {[number, number]} 一个包含更新后资源量和更新后上次充电时间的元组。
     */
    public static refreshResource(resource: number, lastChargedTime: number, limit: number, recoveryInterval: number, recoveryAmount: number, reqTime: number): [number, number] {
        // prepare params
        const recoveryTimes = Math.floor((reqTime - lastChargedTime) / recoveryInterval);
        if (recoveryTimes) { // resource recovery time reached, go through following logics
            if (resource < limit) { // if resource is smaller than limit, means resource can recover
                resource += recoveryTimes * recoveryAmount;
                if (resource > limit) { // resource recovery exceeded the limit, change it to limit
                    resource = limit;
                }
            }
            // if resource recovered, time need to be set to now
            lastChargedTime += recoveryTimes * recoveryInterval;
        }

        return [resource, lastChargedTime];
    }

    /**
     * util.format()
     */
    public static format = util.format;

    /**
     * 将 callback 风格的方法转换为 Promise 风格的方法
     *
     * 该函数接收一个 callback 风格的函数和一个可选的上下文对象，
     * 并返回一个新的 Promise 风格的函数。当调用这个新函数时，
     * 它会执行原始的 callback 函数，并将结果以 Promise 的形式返回。
     *
     * @param {Function} fn - 要转换的 callback 风格的函数，该函数的最后一个参数应为回调函数。
     * @param {any} receiver - 可选的上下文对象，用于指定函数执行时的 this 值。
     * @returns {(...args) => Promise<any>} - 返回一个新的 Promise 风格的函数。
     */
    public static promisify(fn: Function, receiver: any): (...args) => Promise<any> {
        return (...args) => {
            return new Promise((resolve, reject) => {
                fn.apply(receiver, [...args, (err, res) => {
                    return err ? reject(err) : resolve(res);
                }]);
            });
        };
    }

    /**
     * 完全冻结对象中的所有对象
     *
     * 该函数会递归地冻结一个对象及其所有嵌套对象，确保对象的属性不能被修改、添加或删除。
     *
     * @param {Object} obj - 要冻结的对象。
     */
    public static deepFreeze(obj: Object) {
        Object.freeze(obj);
        const keys = Object.keys(obj);
        for (const key of keys) {
            const v = obj[key];
            if (typeof v !== 'object' || Object.isFrozen(v)) {
                continue;
            }
            Utils.deepFreeze(v);
        }
    }

    /**
     * 完全合并对象中的所有对象
     *
     * 该函数会递归地将 obj2 的属性合并到 obj1 中。
     * 如果 obj1 和 obj2 中相同键对应的值都是对象，则递归调用 deepMerge 函数进行合并；
     * 否则，直接用 obj2 中该键对应的值覆盖 obj1 中的值。
     *
     * @param {Object} obj1 - 要合并到的目标对象。
     * @param {Object} obj2 - 要合并的源对象。
     * @returns {Object} - 合并后的对象，即 obj1。
     */
    public static deepMerge(obj1: Object, obj2: Object): object {
        for (const k in obj2) {
            obj1[k] = (obj1[k] && String(obj1[k]) === '[object Object]') ? Utils.deepMerge(obj1[k], obj2[k]) : obj1[k] = obj2[k];
        }
        return obj1;
    }

    /**
     * 封装 retry 方法
     *
     * 该方法用于重试一个异步函数，当函数执行失败时，会按照指定的次数和延迟时间进行重试。
     * 每次重试的延迟时间会以指数方式增加（指数退避）。
     *
     * @param {() => Promise<any>} fn - 要重试的异步函数。
     * @param {number} retryTimes - 重试的次数。
     * @param {number} retryDelay - 每次重试之间的延迟时间，单位为毫秒，默认为 1000 毫秒。
     * @returns {Promise<any>} - 返回异步函数的执行结果。
     */
    public static async retry(
        fn: () => Promise<any>,
        retryTimes: number,
        retryDelay: number = 1000
    ): Promise<any> {
        try {
            return await fn();
        } catch (error) {
            if (retryTimes === 0) {
                throw error;
            }

            await new Promise(resolve =>
                setTimeout(resolve, retryDelay)
            );

            return Utils.retry(
                fn,
                retryTimes - 1,
                retryDelay * 2 // 指数退避
            );
        }
    }

    /**
     * 获取本机 ip 地址
     */
    public static eth0() {
        const iptable = {};
        const network = os.networkInterfaces();
        for (const key in network) {
            network[key].forEach((details, alias) => {
                if (details.family == 'IPv4') {
                    iptable[key + (alias ? ':' + alias : '')] = details.address;
                }
            });
        }
        return iptable.hasOwnProperty('eth0') ? (iptable as any).eth0 : '127.0.0.1';
    }

    /**
     * 从 ArrayObject 中获取指定 field 的列表
     *
     * @param {Object} obj
     * @param {string} fieldName
     * @return Set<any>
     */
    public static getFieldListFromObject(obj: Object, fieldName: string): Set<any> {
        const r = new Set();
        for (const key of Object.keys(obj)) {
            if (obj[key].hasOwnProperty(fieldName) && obj[key][fieldName] !== null) {
                r.add(obj[key][fieldName]);
            }
        }
        return r;
    }

    /**
     * 从 ArrayObject 中获取指定 field 的列表
     *
     * @param {Object} obj
     * @param {string} fieldName
     * @return Map<string, any>
     */
    public static getFieldValueListFromObject(obj: Object, fieldName: string): Map<string, any> {
        const r = new Map();
        for (const key of Object.keys(obj)) {
            if (obj[key].hasOwnProperty(fieldName) && obj[key][fieldName] !== null) {
                r.set(String(obj[key][fieldName]), obj[key]);
            }
        }
        return r;
    }

    /**
     * Convert Array To Object
     *
     * @param list
     * @param pk
     * @param vk
     */
    public static convertArrayToObject = (
        list: any[],
        pk: string | number,
        vk?: string | number,
    ): Record<string, any> => {
        const obj = {};
        if (!list) return obj;
        // eslint-disable-next-line no-return-assign
        list.forEach((v) => (obj[v[pk]] = vk && vk !== '' ? v[vk] : v));
        return obj;
    };
}
