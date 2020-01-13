import * as LibFs from 'mz/fs';
import * as LibPath from 'path';

export namespace ToolUtils {
    /**
     * 正则匹配
     *
     * @param {string} str
     * @param {RegExp} regExp
     * @return {Promise<string>}
     */
    export function regExec(str: string, regExp: RegExp): string {
        const matchResult = regExp.exec(str);
        if (!matchResult) {
            return '';
        }
        return matchResult[0];
    }
    
    /**
     * 通过文件内容获得 EntityClass 的分表数量
     *
     * @param {string} content
     * @param {string} className
     * @return {Promise<number>}
     */
    export async function getShardCount(content: string, className?: string): Promise<number> {
        try {
            const matchText = regExec(content, /\.ShardTable\([0-9]+\)/);
            const numberMatch = regExec(matchText, /[0-9]+/);
            return parseInt(numberMatch, 10);
        } catch (e) {
            return 1;
        }
    }
    
    /**
     * 通过文件内容获得 EntityClass 的 tableName
     *
     * @param {string} content
     * @return {Promise<string>}
     */
    export async function getTableName(content: string): Promise<string> {
        try {
            const matchText = regExec(content, /\.Entity\(\'\S+\'\)/);
            const nameMatch = regExec(matchText, /\'\S+\'/);
            return nameMatch.replace(/\'/g, '');
        } catch (e) {
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
    export async function copyFile(filePath: string, className: string, suffix: string | number): Promise<string> {
        let copyPath = LibPath.join(LibPath.dirname(filePath), `${className}_${suffix}.js`);
        
        try {
            await LibFs.copyFileSync(filePath, copyPath);
            return copyPath;
        } catch (e) {
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
    export async function rewriteFile(filePath: string, className: string, suffix: string | number, content: string, tableName: string): Promise<string> {
        const fileInfo = LibPath.parse(filePath);
        
        try {
            await LibFs.writeFile(
                filePath,
                content
                .replace(new RegExp(className, 'gm'), fileInfo.name)
                .replace(new RegExp(/\.Entity\(\'\S+\'\)/), `.Entity('${tableName}_${suffix}')`)
                .replace(new RegExp(/\.CacheName\(\)/), `.CacheName('${className}')`)
            );
            return fileInfo.name;
        } catch (e) {
            throw e;
        }
    }
    
    /**
     * 根据 shareCount 计算后缀
     *
     * @param {number} i
     * @param {number} type
     * @return {string}
     */
    export function suffix(i: number, type: number): any {
        return (type == 1) ? '' : i;
    }
}
