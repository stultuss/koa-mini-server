import * as path from 'path';
import * as mimeType from 'mime-types';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import {Readable, Writable} from 'stream';

export type FileListFilter = ((filePath: string) => boolean) | string;

export class FileTools {

    /**
     * 递归列出目录下的所有文件（返回完整路径），语义与原 iterable-readfiles 一致：
     * 过滤器返回 true 的目录或文件会被跳过（含目录下的整棵子树）
     *
     * @param {string} dir - 起始目录
     * @param {FileListFilter[]} filters - 过滤规则：字符串按路径段精确匹配，函数接收完整路径
     * @returns {Promise<string[]>} 文件完整路径列表
     */
    public static async listFiles(dir: string, filters: FileListFilter[] = []): Promise<string[]> {
        const entries = await fsp.readdir(dir);
        const list: string[] = [];
        for (const entry of entries) {
            const filePath = path.join(dir, entry);
            const stats = await fsp.stat(filePath);
            const excluded = filters.some((filter) => {
                if (typeof filter === 'string') {
                    return filePath.split(path.sep).includes(filter);
                }
                return filter(filePath);
            });
            if (excluded) {
                continue;
            }
            if (stats.isDirectory()) {
                list.push(...await FileTools.listFiles(filePath, filters));
            } else {
                list.push(filePath);
            }
        }
        return list;
    }

    /**
     * 异步将指定路径的图片文件转换为 Base64 编码字符串。
     *
     * @param {string} url - 图片文件的路径。
     * @returns {Promise<{ fileName: string, bytes: string }>} - 一个 Promise，解决时返回包含文件名和 Base64 编码字符串的对象。
     */
    public static async getBase64(url: string): Promise<{ fileName: string, bytes: string }> {
        try {
            const filePath = path.resolve(url); // 原始文件地址
            const fileName = path.basename(filePath); // 提取文件名
            const fileMimeType = mimeType.lookup(filePath); // 获取文件的 memeType

            // 验证文件存在
            try {
                await fsp.access(filePath);
            } catch {
                throw new Error(`File not found: ${filePath}`);
            }

            // 如果不是图片文件，则退出
            if (!String(fileMimeType).includes('image')) {
                throw new Error('Not an image file');
            }

            return {
                fileName,
                bytes: Buffer.from(fs.readFileSync(filePath)).toString('base64')
            };
        } catch (error) {
            throw new Error(`Failed to convert file to base64: ${error.message}`);
        }
    }

    /**
     * 将可读流保存到可写流对应的文件中。
     *
     * 该方法接受一个可读流和一个可写流作为参数，
     * 通过管道将可读流的数据写入到可写流中，实现文件保存操作。
     *
     * @param {Readable} readable - 要读取数据的可读流。
     * @param {Writable} writable - 要写入数据的可写流。
     * @returns {Promise<any>} - 一个 Promise 对象，当写入操作完成时解决，当出现错误时拒绝。
     */
    public static saveStream(readable: Readable, writable: Writable): Promise<void> {
        return new Promise((resolve, reject) => {
            const stream = readable.pipe(writable); // 可读流通过管道写入可写流
            const timeout = setTimeout(() => {
                stream.destroy();
                reject(new Error('Stream operation timeout'));
            }, 3000);

            stream.on('finish', () => {
                timeout && clearTimeout(timeout);
                resolve();
            });

            stream.on('error', (error) => {
                timeout && clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * 安全地删除文件
     *
     * 此方法会先检查文件是否存在，如果存在则尝试删除该文件。
     * 如果在检查或删除过程中出现错误，会抛出包含错误信息的新错误。
     *
     * @param {string} filePath - 要删除的文件的路径。
     * @returns {Promise<void>} - 一个 Promise，当文件删除操作完成或确定文件不存在时解决，当出现错误时拒绝。
     */
    public static async safeDelete(filePath: string): Promise<void> {
        try {
            await fsp.unlink(filePath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return;
            }
            throw new Error(`Failed to delete file: ${error.message}`);
        }
    }
}
