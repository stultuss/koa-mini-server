import {FlexibleMap} from '../FlexibleMap';

export class JsonTools {
    /**
     * 将 JSON 字符串解析为 JavaScript 对象。
     *
     * 该方法尝试使用 `JSON.parse` 将传入的字符串解析为 JavaScript 对象。
     * 如果解析过程中出现错误，将返回默认值。
     *
     * @param {string} str - 要解析的 JSON 字符串。
     * @param {any} [defaultValue={}] - 解析失败时返回的默认值，默认为空对象。
     * @returns {any} - 解析后的 JavaScript 对象，或解析失败时的默认值。
     */
    public static parse(str: string, defaultValue: any = {}): any {
        try {
            return JSON.parse(str);
        } catch (e) {
            return defaultValue;
        }
    }

    /**
     * 将 JavaScript 对象转换为 JSON 字符串。
     *
     * 该方法使用 `JSON.stringify` 将传入的对象转换为 JSON 字符串。
     * 不处理转换过程中可能出现的错误，直接返回转换后的字符串。
     *
     * @param {Object} obj - 要转换的 JavaScript 对象。
     * @returns {string} - 转换后的 JSON 字符串。
     */
    public static stringify(obj: Object): string {
        return JSON.stringify(obj);
    }

    /**
     * 将 Map 对象转换为 JSON 字符串。
     *
     * 此方法首先调用 `mapToObj` 方法将传入的 Map 对象转换为普通 JavaScript 对象，
     * 然后使用 `JSON.stringify` 方法将该对象转换为 JSON 字符串。
     *
     * @param {Map<any, any>} map - 要转换为 JSON 字符串的 Map 对象。
     * @returns {string} - 转换后的 JSON 字符串。
     */
    public static mapToString(map: Map<any, any>): string {
        return JSON.stringify(this.mapToObj(map));
    }

    /**
     * 将 JSON 字符串转换为 Map 对象。
     *
     * 此方法首先调用 `parse` 方法将传入的 JSON 字符串解析为 JavaScript 对象，
     * 然后调用 `objToMap` 方法将该对象转换为 Map 对象。
     *
     * @param {string} str - 要转换为 Map 对象的 JSON 字符串。
     * @returns {Map<any, any>} - 转换后的 Map 对象。
     */
    public static stringToMap(str: string): Map<any, any> {
        return this.objToMap(this.parse(str));
    }

    /**
     * 将普通 JavaScript 对象转换为 Map 对象。
     *
     * 此方法遍历传入对象的所有键，将每个键值对添加到一个新的 Map 对象中。
     * 键会被转换为字符串类型，以确保 Map 对象的键的一致性。
     *
     * @param {Object} obj - 要转换为 Map 对象的普通 JavaScript 对象。
     * @returns {Map<string, any>} - 转换后的 Map 对象，键为字符串类型，值保持原类型。
     */
    public static objToMap(obj: Object): Map<string, any> {
        // 使用 FlexibleMap：键统一为字符串，同时支持 number/string 等原始类型互相查找
        const strMap = new FlexibleMap();
        for (const k of Object.keys(obj)) {
            strMap.set(String(k), obj[k]);
        }
        return strMap;
    }

    /**
     * 将 Map 对象转换为普通 JavaScript 对象。
     *
     * 此方法遍历传入的 Map 对象的所有键值对，将每个键值对添加到一个新创建的普通 JavaScript 对象中。
     * 该对象没有原型链，避免了原型链上的属性干扰。
     *
     * @param {Map<any, any>} map - 要转换为普通对象的 Map 对象。
     * @returns {Object} - 转换后的普通 JavaScript 对象。
     */
    public static mapToObj(map: Map<any, any>): Object {
        const obj = Object.create(null);
        for (const [k, v] of map) {
            obj[k] = v;
        }
        // 返回转换后的普通对象
        return obj;
    }
}
