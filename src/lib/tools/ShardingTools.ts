import {CryptoTools} from './CryptoTools';

export type ShardValue = string | number | null;

export interface ShardingOptions {
    count: number;
    value: ShardValue;
    algorithm?: 'mod' | 'hash';
}

export class ShardingTools {
    /**
     * 获取分片 ID
     */
    public static getShardId(options: ShardingOptions): number {
        const {count = 1, value, algorithm = 'mod'} = options;

        if (count <= 1 || value == null || value == '') {
            return 0;
        }

        return algorithm === 'hash'
            ? this.getHashShardId(count, value)
            : this.getModShardId(count, value);
    }

    /**
     * 分片算法：取模
     *
     * @param {number} count
     * @param {string} shardValue
     * @return {number}
     */
    private static getModShardId(count: number, shardValue: ShardValue): number {
        const value = String(shardValue);
        const formatted = Number(value);

        if (!Number.isNaN(formatted)) {
            // fixme number 类型的 value 可能长度超过 8 位, 所以需要截取最后 8 位
            return Number(value.slice(-8)) % count;
        }

        // fixme string 类型的 value 之前使用了 **最后一位** 作为分片的键, 所以为了保持 position 不变，这里不做修改
        const lastChar = value.slice(-1);
        const lastNumber = Number(lastChar);

        return !Number.isNaN(lastNumber)
            ? lastNumber % count
            : lastChar.charCodeAt(0) % count;
    }


    /**
     * 分片算法：哈希取模法
     *
     * @param {number} count
     * @param {string} shardValue
     * @return {number}
     */
    private static getHashShardId(count: number, shardValue: ShardValue): number {
        return Number(BigInt(CryptoTools.crc32(shardValue)) % BigInt(count));
    }
}
