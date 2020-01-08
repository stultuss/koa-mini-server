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
const Koa = require("koa");
const koaBody = require("koa-body");
const koaCors = require("koa2-cors");
const RouteLoader_1 = require("./apis/RouteLoader");
const LoggerManager_1 = require("./common/logger/LoggerManager");
const CacheFactory_class_1 = require("./common/cache/CacheFactory.class");
const server_config_1 = require("./config/server.config");
const cache_config_1 = require("./config/cache.config");
const ErrorFormat_1 = require("./common/exception/ErrorFormat");
const Utility_1 = require("./common/Utility");
class Server {
    constructor() {
        this._app = new Koa();
        this._initialized = false;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            // 系统初始化(同步)
            let queue = [];
            queue.push(LoggerManager_1.LoggerManager.instance().init());
            queue.push(RouteLoader_1.default.instance().init());
            queue.push(CacheFactory_class_1.CacheFactory.instance().init(cache_config_1.cacheType, cache_config_1.cacheConfig));
            yield Promise.all(queue);
            // 完成初始化
            this._initialized = true;
        });
    }
    start() {
        if (!this._initialized) {
            throw new ErrorFormat_1.ErrorFormat(10000, 'Koa Server not initialized yet');
        }
        // 加载中间件
        this._app.use(koaCors({
            origin: (ctx) => {
                let origin = '*';
                let allowDomain = server_config_1.serverConfig.allowDomain;
                for (const i in allowDomain) {
                    if (ctx.header.origin && (ctx.header.origin.indexOf(allowDomain[i]) > -1)) {
                        origin = ctx.header.origin;
                        break;
                    }
                }
                return origin;
            },
            exposeHeaders: ['WWW-Authenticate', 'Server-Authorization'],
            maxAge: 86400,
            credentials: true,
            allowMethods: ['GET', 'POST', 'DELETE'],
            allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
        }));
        this._app.use(koaBody({ formLimit: '2048kb' }));
        this._app.use(RouteLoader_1.default.instance().routes);
        // 启动服务器，监听端口
        this._app.listen(server_config_1.serverConfig.port, server_config_1.serverConfig.host, () => {
            Utility_1.CommonTools.logger(`Koa Server started, env: ${server_config_1.serverConfig.env}, listening on: ${server_config_1.serverConfig.host}:${server_config_1.serverConfig.port}`);
        });
    }
}
exports.default = new Server();
