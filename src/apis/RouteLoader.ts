import * as KoaRouter from 'koa-router';
import * as LibPath from 'path';
import {readfiles} from 'iterable-readfiles';
import {AbstractBase} from './abstract/AbstractBase';

/**
 * 路由加载器
 */
export default class RouteLoader {
    private static _instance: RouteLoader;

    private readonly _router: KoaRouter;

    private constructor() {
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
    public async init() {
        // 读取文件夹中所有文件。
        let files = await readfiles(__dirname, ['abstract']);
        if (files.length == 0) {
            throw new Error("Route not found")
        }
        // 过滤出文件名中包含 ".api.js" 的路由文件
        let filePaths = [];
        for (let file of files) {
            if (LibPath.basename(file).match(/.+\.api.js$/) === null) {
                continue;
            }
            filePaths.push(file);
        }
        // 验证路由
        if (filePaths.length == 0) {
            throw new Error('Routes is empty!');
        }
        // 加载路由
        for (let filePath of filePaths) {
            await this._loadRouter(filePath);
        }
    }
    
    /**
     * 加载路由，屏蔽报错
     *
     * @param path string
     * @private
     */
    private _loadRouter(path: string): void {
        try {
            let api = require(path) as AbstractBase;
            this._router[api.method].apply(this._router, api.register());
        } catch (err) {
            console.error(err.toString());
        }
    }
    
    /**
     * 向外提供 routes
     */
    public get routes() {
        return this._router.routes();
    }
}