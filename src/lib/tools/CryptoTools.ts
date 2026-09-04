import * as crypto from 'crypto';

export class CryptoTools {
    /**
     * 计算给定内容的 MD5 哈希值。
     *
     * 此方法接受一个字符串或数字类型的内容，将其转换为字符串后，使用 Node.js 的 crypto 模块计算其 MD5 哈希值，并以十六进制字符串的形式返回。
     *
     * @param {string | number} content - 要计算 MD5 哈希值的内容，可以是字符串或数字。
     * @returns {string} - 计算得到的 MD5 哈希值，以十六进制字符串表示。
     */
    public static md5(content: string | number): string {
        return crypto.createHash('md5').update(String(content)).digest('hex');
    }

    /**
     * 计算给定内容的 SHA-1 哈希值。
     *
     * 此方法接受一个字符串或数字类型的内容，将其转换为字符串后，使用 Node.js 的 crypto 模块计算其 SHA-1 哈希值，并以十六进制字符串的形式返回。
     *
     * @param {string | number} content - 要计算 SHA-1 哈希值的内容，可以是字符串或数字。
     * @returns {string} - 计算得到的 SHA-1 哈希值，以十六进制字符串表示。
     */
    public static sha1(content: string | number): string {
        return crypto.createHash('sha1').update(String(content)).digest('hex');
    }

    /**
     * 计算给定内容的 SHA-256 哈希值。
     *
     * 此方法接受一个字符串或数字类型的内容，将其转换为字符串后，使用 Node.js 的 crypto 模块计算其 SHA-256 哈希值，并以十六进制字符串的形式返回。
     *
     * @param {string | number} content - 要计算 SHA-256 哈希值的内容，可以是字符串或数字。
     * @returns {string} - 计算得到的 SHA-256 哈希值，以十六进制字符串表示。
     */
    public static sha256(content: string | number): string {
        return crypto.createHash('sha256').update(String(content)).digest('hex');
    }

    /**
     * 计算给定内容的 Hmac SHA-256 哈希值。
     *
     * 此方法接受一个字符串或数字类型的内容，将其转换为字符串后，使用 Node.js 的 crypto 模块计算其 SHA-1 哈希值，并以十六进制字符串的形式返回。
     *
     * @param {string} secret
     * @param {string | number} content
     * @returns {string} - 计算得到的 SHA-256 哈希值，以十六进制字符串表示。
     */
    public static Hmac_Sha256(secret: string, content: string | number): string {
        return crypto.createHmac('sha256', secret).update(String(content)).digest('hex');
    }

    /**
     * 使用 HMAC 算法结合指定的密钥对内容进行哈希计算。
     *
     * 此方法接受一个指定的哈希算法（当前仅支持 'sha1'）、要哈希的内容、密钥和一个布尔值，用于指定是否以原始二进制格式输出。
     * 它使用 Node.js 的 crypto 模块创建一个 HMAC 哈希对象，更新内容并计算哈希值，最后根据 `raw_output` 参数决定输出格式。
     *
     * @param {'sha1'} algo - 要使用的哈希算法，当前仅支持 'sha1'。
     * @param {string} content - 要进行哈希计算的内容。
     * @param {string} key - 用于 HMAC 计算的密钥。
     * @param {boolean} [raw_output=false] - 可选参数，指定是否以原始二进制格式输出，默认为 false，即输出十六进制字符串。
     * @returns {string} - 计算得到的 HMAC 哈希值，根据 `raw_output` 参数决定输出格式。
     */
    public static hmac(algo: 'sha1', content: string, key: string, raw_output: boolean = false): string {
        return crypto.createHmac(algo, key).update(String(content)).digest((raw_output) ? null : 'hex');
    }

    /**
     * 对内容进行加密操作。
     *
     * 此方法使用 AES-128-ECB 算法对传入的 UTF-8 字符串内容进行加密。
     * 它会根据提供的密钥和可选的初始化向量（IV）来配置加密器。
     *
     * @param {string} content - 要加密的 UTF-8 字符串内容。
     * @param {string} secret - 用于加密的密钥。
     * @returns {string} - 加密后的十六进制字符串。
     */
    public static encrypt(content: string, secret: string): string {
        // 加密配置设置
        const Key = crypto.createHash('sha256').update(String(secret)).digest('base64').slice(0, 16);
        const cipher = crypto.createCipheriv('aes-128-ecb', Key, '');
        // 加密开始
        const encode = [];
        encode.push(cipher.update(content, 'utf8', 'hex'));
        encode.push(cipher.final('hex'));
        return encode.join('');
    }


    /**
     * 对加密内容进行解密操作。
     *
     * 此方法使用 AES-128-ECB 算法对传入的十六进制加密内容进行解密。
     * 它会根据提供的密钥和可选的初始化向量（IV）来配置解密器。
     *
     * @param {string} content - 要解密的十六进制字符串内容。
     * @param {string} secret - 用于解密的密钥。
     * @returns {string} - 解密后的 UTF-8 字符串。
     */
    public static decrypt(content: string, secret: string): string {
        // 解密配置设置
        const Key = crypto.createHash('sha256').update(String(secret)).digest('base64').slice(0, 16);
        const decipher = crypto.createDecipheriv('aes-128-ecb', Key, '');
        // 解密开始
        const decode = [];
        decode.push(decipher.update(content, 'hex', 'utf8'));
        decode.push(decipher.final('utf8'));
        return decode.join('');
    }

    /**
     * 计算给定内容的 CRC32 校验值。
     *
     * 此方法接受任意类型的内容，将其转换为字符串后，计算其 CRC32 校验值。
     * 它使用预先生成的 CRC32 表来加速计算过程。
     *
     * @param {any} content - 要计算 CRC32 校验值的内容，可以是任意类型。
     * @returns {number} - 计算得到的 CRC32 校验值。
     */
    public static crc32(content: any): number {
        /**
         * 生成 CRC32 表。
         *
         * 该表用于加速 CRC32 计算过程。
         *
         * @returns {number[]} - 生成的 CRC32 表。
         */
        function makeCRCTable(): number[] {
            let c: number;
            let crcTable = [];
            for (let n = 0; n < 256; n++) {
                c = n;
                for (let k = 0; k < 8; k++) {
                    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
                }
                crcTable[n] = c;
            }
            return crcTable;
        }

        let crcTable = makeCRCTable();
        let crc = 0 ^ (-1);
        let str = String(content);
        for (let i = 0; i < str.length; i++) {
            crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
        }
        return (crc ^ (-1)) >>> 0;
    }

    /**
     * openssl 签名
     *
     * @param content
     * @param private_key
     */
    public static openssl_sign(content: string, private_key: string): string {
        let key = '-----BEGIN PRIVATE KEY-----\n';
        key += CryptoTools.wordwrap(private_key, 64);
        key += '-----END PRIVATE KEY-----';
        return crypto.createSign('RSA-SHA256').update(content.toString()).sign(key, 'base64');
    }

    /**
     * openssl 签名验证
     *
     * @param content
     * @param sign
     * @param public_key
     */
    public static openssl_verify(content: string, sign: string, public_key: string): boolean {
        let key = '-----BEGIN PUBLIC KEY-----\n';
        key += CryptoTools.wordwrap(public_key, 64);
        key += '-----END PUBLIC KEY-----';
        return crypto.createVerify('RSA-SHA256').update(content.toString()).verify(key, sign, 'base64');
    }

    /**
     * 生成2048位RSA密钥对
     *
     * @returns {{ publicKey: string, privateKey: string }}
     */
    public static generateRSAKeyPair(): { publicKey: string, privateKey: string } {
        const { generateKeyPairSync } = require('crypto');
        const { publicKey, privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
        // 提取主体部分（去除头尾和换行）
        const extractBody = (pem: string) => pem.replace(/-----.*?-----/g, '').replace(/\s+/g, '');

        return { 
            publicKey: extractBody(publicKey),
            privateKey: extractBody(privateKey) 
        };
    }

    /**
     * 字符换行
     *
     * @param context
     * @param num
     * @param newline
     */
    public static wordwrap(context: string, num: number, newline: string = '\n') {
        let str = '';
        for (let i = 0; i < Math.ceil(context.toString().length / num); i++) {
            str += context.slice(i * num, (i + 1) * num) + newline;
        }
        return str;
    }

    /**
     * 将裸密钥内容包装成 PEM 格式（64 字符换行）。
     *
     * @param {string} content - 裸密钥/证书内容（无头尾、无换行）。
     * @param {'CERTIFICATE' | 'PRIVATE KEY'} type - PEM 块类型。
     * @returns {string} 完整的 PEM 字符串。
     */
    public static make_pem(content: string, type: 'CERTIFICATE' | 'PRIVATE KEY'): string {
        let str = `-----BEGIN ${type}-----\n`;
        str += CryptoTools.wordwrap(content, 64);
        str += `-----END ${type}-----`;
        return str;
    }
}
