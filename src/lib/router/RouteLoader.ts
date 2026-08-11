import * as path from 'path';
import KoaRouter from '@koa/router';
import {FileTools} from '../tools/FileTools';
import {ErrorMessage} from '../exception/ErrorMessage';
import {Logger} from '../Logger';

/**
 * 路由加载器
 */
export class RouteLoader {
    private static _instance: RouteLoader;
    private readonly _router: KoaRouter;
    private _initialized: boolean;

    private constructor() {
        this._initialized = false;
        this._router = new KoaRouter();
    }

    public static instance(): RouteLoader {
        if (RouteLoader._instance === undefined) {
            RouteLoader._instance = new RouteLoader();
        }
        return RouteLoader._instance;
    }

    /**
     * 初始化 RouterLoader
     */
    public async init(dir: string) {
        // 避免重复初始化
        if (this._initialized) {
            return;
        }

        // 读取文件夹文件
        const filePaths = await FileTools.listFiles(dir, ['.DS_Store', (filePath) => {
            // 当目标是文件夹或者文件名中包含 ".api.js" 时，不需要被过滤
            const parsedPath = path.parse(filePath);
            return !(parsedPath.ext === '' || parsedPath.base.match(/.+\.api.js$/) !== null);
        }]);

        // 验证路由
        if (!filePaths || filePaths.length == 0) {
            throw new ErrorMessage(10000, 'Routes is empty!');
        }

        // 加载路由
        for (const filePath of filePaths) {
            this._loadRouter(filePath);
        }

        this._initialized = true;
    }

    /**
     * 加载路由；单个路由加载失败仅记录日志，不中断整体启动
     *
     * @param path string
     * @private
     */
    private _loadRouter(path: string): void {
        try {
            // 兼容两种导出方式：`export default new API()` 与 `module.exports = new API()`
            const loaded = require(path);
            const api = loaded.default || loaded;
            const method = api.method.toLowerCase();

            if (typeof this._router[method] !== 'function') {
                Logger.error(`Unsupported HTTP method: ${api.method}`);
                return;
            }

            (this._router as any)[method].apply(this._router, api.register());
            Logger.debug(`[ROUTER] method: ${api.method}, uri: ${api.uri}`);
        } catch (e) {
            Logger.error(`[ROUTER] Failed to load router: ${e.message}`, e);
        }
    }

    /**
     * 向外提供 routes
     */
    public get routes() {
        return this._router.routes();
    }
}
