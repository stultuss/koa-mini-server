import * as fsp from 'fs/promises';
import * as path from 'path';
import { Logger } from '../../Logger';
export class OrmUtils {
    /**
     * 正则匹配
     *
     * @param {string} str
     * @param {RegExp} regExp
     * @return {Promise<string>}
     */
    public static regExec(str: string, regExp: RegExp): string {
        if (!str) return '';
        const res = regExp.exec(str);
        return !res ? '' : res[0];
    }

    /**
     * 通过文件内容获得 EntityClass 的分表数量
     *
     * @param {string} content
     * @param {string} className
     * @return {Promise<number>}
     */
    public static async getShardCount(content: string, className?: string): Promise<number> {
        try {
            const matchText = this.regExec(content, /\.ShardTable\([0-9]+\)/) || this.regExec(content, /\.ShardTable\)\([0-9]+\)/);
            const numberMatch = this.regExec(matchText, /[0-9]+/);
            return parseInt(numberMatch, 10);
        } catch (e) {
            Logger.warn(`[ORM] getShardCount: ${className} not found ShardTable`);
            return 1;
        }
    }

    /**
     * 通过文件内容获得 EntityClass 的 tableName
     *
     * @param {string} content
     * @return {Promise<string>}
     */
    public static async getTableName(content: string): Promise<string> {
        try {
            const matchText = this.regExec(content, /\.Entity\(\'\S+\'\)/) || this.regExec(content, /\.Entity\)\(\'\S+\'\)/);
            const nameMatch = this.regExec(matchText, /\'\S+\'/);
            return nameMatch.replace(/\'/g, '');
        } catch (e) {
            Logger.warn('[ORM] getTableName: Empty content provided');
            return null;
        }
    }

    /**
     * 文件拷贝
     *
     * @param {string} filePath
     * @param {string} className
     * @param {string} suffix
     * @return {Promise<string>}
     */
    public static async copyFile(filePath: string, className: string, suffix: string | number): Promise<string> {
        const copyPath = path.join(path.dirname(filePath), `${className}_${suffix}.js`);
        try {
            // 哪怕文件已经存在，也需要覆盖该文件，因为文件内容可能发生变化
            await fsp.copyFile(filePath, copyPath);
            return copyPath;
        } catch (e) {
            Logger.warn(`[ORM] Failed to copy file from ${filePath} to ${copyPath}:`, e);
            throw e;
        }
    }

    /**
     * 通过正则重写文件内的某些 string
     *
     * @param {string} filePath
     * @param {string} className
     * @param {string} suffix
     * @param {string} content
     * @param {string} tableName
     * @return {Promise<string>}
     */
    public static async rewriteFile(filePath: string, className: string, suffix: string | number, content: string, tableName: string): Promise<string> {
        const fileInfo = path.parse(filePath);
        try {
            await fsp.writeFile(
                filePath,
                content
                    .replace(new RegExp(`${className} =`, 'gm'), `${fileInfo.name} =`)
                    .replace(new RegExp(`class ${className}`, 'gm'), `class ${fileInfo.name}`)
                    .replace(new RegExp(`${className}.prototype`, 'gm'), `${fileInfo.name}.prototype`)
                    .replace(new RegExp(`${className}\\);`), `${fileInfo.name});`)
                    .replace(new RegExp(`exports.${fileInfo.name} = ${className};`), `exports.${fileInfo.name} = ${fileInfo.name};`)
                    .replace(new RegExp(/\.Entity\(\'\S+\'\)/), `.Entity('${tableName}_${suffix}')`)
                    .replace(new RegExp(/\.Entity\)\(\'\S+\'\)/), `.Entity)('${tableName}_${suffix}')`)
                    .replace(new RegExp(/\.CacheName\([^)]*\)/), `.CacheName('${className}')`)
                    .replace(new RegExp(/\.CacheName\)\([^)]*\)/), `.CacheName)('${className}')`)
            );
            return fileInfo.name;
        } catch (e) {
            Logger.warn(`[ORM] Failed to rewrite file ${filePath}:`, e);
            throw e;
        }
    }

    /**
     * 根据 shareCount 计算后缀
     *
     * @param {number} i
     * @param {number} type
     * @return {number | string}
     */
    public static suffix(i: number, type: number): number | string {
        return (type == 1) ? '' : i;
    }
}
