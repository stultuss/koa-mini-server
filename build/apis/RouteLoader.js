"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const KoaRouter = require("koa-router");
const LibPath = require("path");
const iterable_readfiles_1 = require("iterable-readfiles");
/**
 * 路由加载器
 */
class RouteLoader {
    constructor() {
        this._router = new KoaRouter();
    }
    static instance() {
        if (RouteLoader._instance === undefined) {
            RouteLoader._instance = new RouteLoader();
        }
        return RouteLoader._instance;
    }
    /**
     * 初始化 RouterLoader
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            // 读取文件夹中所有文件。
            let files = yield iterable_readfiles_1.readfiles(__dirname, ['abstract']);
            if (files.length == 0) {
                throw new Error("Route not found");
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
                yield this._loadRouter(filePath);
            }
        });
    }
    /**
     * 加载路由，屏蔽报错
     *
     * @param path string
     * @private
     */
    _loadRouter(path) {
        try {
            let api = require(path);
            this._router[api.method].apply(this._router, api.register());
        }
        catch (err) {
            console.error(err.toString());
        }
    }
    /**
     * 向外提供 routes
     */
    get routes() {
        return this._router.routes();
    }
}
exports.default = RouteLoader;
