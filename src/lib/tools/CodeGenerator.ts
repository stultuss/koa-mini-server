import * as crypto from 'crypto';
import {CryptoTools} from './CryptoTools';

export const CODE_LENGTH = 4; // 每个部分的长度
export const PARTS_COUNT = 4; // 分隔数量
export const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 排除易混淆字符
export const ALPHABET_LENGTH = ALPHABET.length; // 包含签名的总长度

export class CodeGenerator {
    private readonly secretKey: string;

    constructor(secretKey: any) {
        this.secretKey = secretKey.toString();
    }

    /**
     * 生成礼包码
     *
     * @param {number} id
     * @return string
     */
    public generateCode(id: number): string {
        // 压缩包ID
        const encodedId = CodeGenerator.encodeNumber(id, CODE_LENGTH);

        // 随机数部分，增加唯一性
        const randomPart = this.generateSeedBasedRandom(CODE_LENGTH * 2);

        // 组合数据部分
        const dataPart = encodedId + randomPart;

        // 生成签名（5个字符）
        const signature = this.generateSignature(dataPart, CODE_LENGTH + 2);

        // 最终编码
        return this.format(dataPart, signature);
    }

    /**
     * Format the code by combining dataPart and signature
     *
     * @param {string} dataPart
     * @param {string} signature
     * @returns {string}
     */
    private format(dataPart: string, signature: string): string {
        return (dataPart.replace(/(.{4})/g, '$1-').replace(/-$/, '') + '-' + signature).toUpperCase();
    }

    /**
     * 验证礼包码
     *
     * @param {string} code
     * @return {
     *  valid: boolean;
     *  id: number | null;
     *  message: string
     * }
     */
    public verifyCode(code: string): { valid: boolean; id: number | null; message: string } {
        try {
            // 移除分隔符
            const cleanCode = code.replace(/-/g, '').toUpperCase();

            // 检查长度
            if (cleanCode.length !== CODE_LENGTH * PARTS_COUNT + 2) {
                return {valid: false, id: null, message: 'Invalid code length!'};
            }

            // 拆分各部分
            const encodedId = cleanCode.substring(0, CODE_LENGTH);
            const randomPart = cleanCode.substring(CODE_LENGTH, CODE_LENGTH * 3);
            const signature = cleanCode.substring(CODE_LENGTH * 3);

            // 解析各部分
            const id = CodeGenerator.decodeNumber(encodedId);
            const dataPart = encodedId + randomPart;

            // 验证签名
            const expectedSignature = this.generateSignature(dataPart, CODE_LENGTH + 2);
            if (signature.toUpperCase() !== expectedSignature.toUpperCase()) {
                return {valid: false, id: null, message: 'Invalid signature!'};
            }

            return {valid: true, id, message: 'Success'};
        } catch (error: any) {
            return {valid: false, id: null, message: `Error: ${error.message}`};
        }
    }

    /**
     * 生成 HMAC 签名
     *
     * @private
     * @param {string} data
     * @param {number} length
     * @return {string}
     */
    private generateSignature(data: string, length: number): string {
        const signature = CryptoTools.md5(data + this.secretKey);
        return signature
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .substring(0, length).toUpperCase();
    }

    /**
     * 辅助方法：生成随机字符串
     *
     * @private
     * @param {number} length
     * @return {string}
     */
    private generateSeedBasedRandom(length: number): string {
        // 1. 生成动态种子（时间戳+随机缓冲区）
        const timestamp = BigInt(Date.now());
        const randomBigInt = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
        const seed = (timestamp + randomBigInt).toString();

        // 2. 基于种子生成8位随机字符
        let randomString = '';
        for (let i = 0; i < length; i++) {
            // 每次生成一个随机索引（利用种子+循环数增强随机性）
            const hash = CryptoTools.sha1(`${seed}_${i}`); // 使用 SHA1 哈希函数
            const index = parseInt(hash.slice(0, 4), 16) % ALPHABET_LENGTH; // 取前4位十六进制转整数
            randomString += ALPHABET[index];
        }
        return randomString;
    }

    /**
     * 辅助方法：将数字编码为固定长度的字符串
     *
     * @private
     * @param {number} num
     * @param {number} length
     * @return {string}
     */
    public static encodeNumber(num: number, length: number): string {
        let encoded = '';
        for (let i = 0; i < length; i++) {
            encoded = ALPHABET[num % ALPHABET_LENGTH] + encoded;
            num = Math.floor(num / ALPHABET_LENGTH);
        }
        return encoded;
    }

    /**
     * 辅助方法：将字符串解码为数字
     *
     * @private
     * @param {string} str
     * @return {number}
     */
    public static decodeNumber(str: string): number {
        let num = 0;
        for (const char of str) {
            const idx = ALPHABET.indexOf(char);
            if (idx === -1) throw new Error('Invalid character in code');
            num = num * ALPHABET_LENGTH + idx;
        }
        return num;
    }
}