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
class Server {
    constructor() {
        this._app = new Koa();
        this._initialized = false;
    }
    init(configs) {
        return __awaiter(this, void 0, void 0, function* () {
            // 保存配置
            this._configs = configs;
            // 系统初始化(同步)
            let queue = [];
            queue.push(RouteLoader_1.default.instance().init());
            yield Promise.all(queue);
            // 完成初始化
            this._initialized = true;
        });
    }
    start() {
        if (!this._initialized) {
            console.log('Koa Server not initialized yet');
            return;
        }
        // 加载中间件
        this._app.use(koaCors({
            origin: (ctx) => {
                let origin = '*';
                let allowDomain = this._configs.server.allowDomain;
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
        this._app.listen(this._configs.server.port, this._configs.server.host, () => {
            console.log(`Koa Server started, listening on: ${this._configs.server.host}:${this._configs.server.port}`);
        });
    }
}
exports.default = new Server();
