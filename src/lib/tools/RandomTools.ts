import {webcrypto} from 'crypto';

export interface RandomOptions {
    secure?: boolean;  // 是否使用加密随机数
    chars?: string;    // 自定义字符集
    prefix?: string;   // 前缀
}

export class RandomTools {
    private static readonly DEFAULT_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    private static readonly NUMBER_CHARS = '0123456789';

    /**
     * 生成 UUID
     *
     * 此方法优先使用 Web Crypto API 生成符合 RFC 4122 版本 4 的 UUID。
     * 如果不支持 `webcrypto.randomUUID()`，则使用备用的基于时间戳和随机数的算法生成 UUID。
     *
     * @returns {string} 生成的 UUID 字符串
     */
    public static uuid(): string {
        return webcrypto.randomUUID();
        // 备用的 UUID 生成算法
        // let d = Date.now();
        // if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        //     d += performance.now(); //use high-precision timer if available
        // }
        // return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        //     let r = (d + Math.random() * 16) % 16 | 0;
        //     d = Math.floor(d / 16);
        //     return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        // });
    }

    /**
     * 生成安全的随机字符串。
     *
     * 此方法使用 Web Crypto API 生成安全的随机字节，然后将这些字节映射到指定的字符集上，生成随机字符串。
     *
     * @param {number} length - 要生成的随机字符串的长度。
     * @param {string} chars - 用于生成随机字符串的字符集。
     * @returns {string} - 生成的安全随机字符串。
     */
    private static secureRandom(length: number, chars: string): string {
        const bytes = new Uint8Array(length);
        webcrypto.getRandomValues(bytes);

        return Array.from(bytes)
            .map(byte => chars.charAt(byte % chars.length))
            .join('');
    }

    /**
     * 生成随机字符串
     *
     * 此方法根据指定的长度和选项生成随机字符串。可以选择使用安全随机数生成器，
     * 并指定自定义的字符集。
     *
     * @param {number} length - 要生成的随机字符串的长度，默认为 4。
     * @param {RandomOptions} options - 生成随机字符串的选项，包括是否使用安全随机数和自定义字符集。
     * @returns {string} - 生成的随机字符串。
     */
    public static randStr(length: number = 4, options: RandomOptions = {}): string {
        const {chars = this.DEFAULT_CHARS, secure = false} = options;
        if (length < 1) {
            throw new Error('Length must be a positive integer greater than 0');
        }
        if (secure) {
            return this.secureRandom(length, chars);
        }
        return Array.from(
            {length},
            () => chars.charAt(Math.floor(Math.random() * chars.length))
        ).join('');
    }

    /**
     * 生成指定长度的随机数字字符串
     *
     * 此方法调用 `randStr` 方法，使用 `NUMBER_CHARS` 字符集（仅包含数字 0 - 9）生成随机字符串。
     *
     * @param {number} length - 要生成的随机数字字符串的长度，默认为 6。
     * @returns {string} - 生成的随机数字字符串。
     */
    public static randNumber(length: number = 6): string {
        return this.randStr(length, {chars: this.NUMBER_CHARS});
    }

    /**
     * 对数组进行乱序处理
     *
     * 此方法使用 Fisher-Yates 洗牌算法对输入的数组进行乱序操作，返回一个新的乱序后的数组，原数组保持不变。
     *
     * @param {any[]} array - 要进行乱序处理的数组。
     * @returns {Array<any>} - 乱序后的新数组。
     * @throws {Error} 如果输入不是数组，抛出错误提示 "Input must be an array"。
     */
    public static shuffle(array: any[]): Array<any> {
        if (!Array.isArray(array)) {
            throw new Error('Input must be an array');
        }
        // Fisher-Yates 洗牌算法
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /**
     * 根据概率列表随机获取一个元素。
     * 如果某个元素的概率为 0，则直接返回该元素，不进行随机计算。
     * 概率逻辑：百分比概率由所有概率值的总和决定。
     *
     * 例如，所有概率值的总和为 10000：
     * bonusId => probability
     * 10      => 500  5%
     * 11      => 500  5%
     * 12      => 500  5%
     * 13      => 400  4%
     * 14      => 50   0.5%
     * 15      => 50   0.5%
     * 16      => 1500 15%
     * 17      => 1500 15%
     * 18      => 5000 50%
     *
     * @param {Object} probabilityList - 一个对象，键为 bonusId，值为对应的概率。
     * @returns {string} - 随机选中的 bonusId，如果没有合适的选项则返回 null。
     */
    public static getRandomElementByProbability(probabilityList: { [bonusId: string]: number }): string {
        let all = 0;
        let result: string = null;
        let bonusIds = Object.keys(probabilityList);

        if (!probabilityList || typeof probabilityList !== 'object') {
            return result;
        }

        // 遍历所有 bonusId
        bonusIds.forEach((bonusId) => {
            // 配置 probability = 0，则代表必中
            if (probabilityList[bonusId] == 0) {
                result = bonusId;
                return;
            }
            all += probabilityList[bonusId];
        });

        // 如果没有找到概率为 0 的 bonusId，如果随机数小于等于累积概率，则将该 bonusId 设为结果
        if (result == null) {
            // 当所有概率都为 0，则返回 null
            if (all <= 0) return result;

            let seed = this.getRandomFromRange(0, all);
            let sum = 0;

            // 再次遍历所有 bonusId
            bonusIds.forEach((bonusId) => {
                if (result != null) {
                    return;
                }

                // get bonus id by probability
                sum += probabilityList[bonusId];
                if (seed <= sum) {
                    result = bonusId;
                    return;
                }
            });
        }

        return result;
    }

    /**
     * 获取指定范围内的随机数。
     *
     * 此方法接受两个参数 `min` 和 `max`，代表随机数的范围。
     * 它会自动处理 `min` 和 `max` 的顺序，确保 `min` 小于等于 `max`。
     * 生成的随机整数满足 `min <= x <= max`。
     *
     * @param {number} min - 随机数范围的最小值。
     * @param {number} max - 随机数范围的最大值。
     * @returns {number} - 生成的随机数。
     */
    public static getRandomFromRange(min: number, max: number): number {
        // 参数验证
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            throw new Error('min 和 max 必须是有效数字');
        }
        
        if (min === max) return min;
        if (min > max) [min, max] = [max, min];

        return Math.round(Math.random() * (max - min) + min);
    }

    /**
     * 计算给定百分比概率是否命中。
     *
     * @param {number} rate - 概率值，可以是 1 - 100 之间的整数，也可以是 0.xx 形式的小数。如果是小数，会将其乘以 100 转换为百分比。
     * @returns {boolean} - 如果命中返回 true，未命中返回 false。
     */
    public static calcPercentageRate(rate: number): boolean {
        const percentage = rate <= 1 ? rate * 100 : rate;
        if (percentage <= 0) return false;
        if (percentage >= 100) return true;
        return Math.random() * 100 < percentage;
    }
}
