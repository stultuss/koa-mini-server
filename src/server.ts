import * as path from 'path';

import Koa from 'koa';
import koaCors from '@koa/cors';
import koaHelmet from 'helmet';
import koaBody from 'koa-body';

import {Logger} from './lib/Logger';
import {ErrorMessage} from './lib/exception/ErrorMessage';
import {LoggerManager} from './lib/logger/LoggerManager';
import {SettingManager} from './lib/setting/SettingManager';
import {RouteLoader} from './lib/router/RouteLoader';
import {CacheFactory} from './lib/cache/CacheFactory.class';
import {OrmFactory} from './lib/orm/OrmFactory.class';

import {serverConfig} from './config/server.config';
import {cacheConfig, cacheType} from './config/cache.config';
import {dbConfig} from './config/db.config';

class Server {
    private _initialized: boolean;
    private _app: Koa;

    constructor() {
        this._app = new Koa();
        this._initialized = false;
    }

    public async init(): Promise<any> {
        // 配置先于路由加载，保证 API 构造时可读取 settings
        await SettingManager.instance().init(path.join(__dirname, '..', 'settings'));

        // 系统初始化(并行)
        const queue = [];
        queue.push(LoggerManager.instance().init());
        queue.push(RouteLoader.instance().init(path.join(__dirname, 'apis')));
        queue.push(CacheFactory.instance().init(cacheType, cacheConfig));
        queue.push(OrmFactory.instance().init(dbConfig));
        await Promise.all(queue);

        // 完成初始化
        this._initialized = true;
    }

    public start(): void {
        if (!this._initialized) {
            throw new ErrorMessage(10000, '[KOA] Server not initialized yet');
        }

        this._app.use(async (ctx, next) => {
            await new Promise<void>((resolve) => {
                koaHelmet({
                    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
                    xssFilter: true,
                    noSniff: true,
                })(ctx.req, ctx.res, resolve);
            });
            await next();
        });
        this._app.use(koaCors());
        this._app.use(koaBody({ formLimit: '204800kb' }));
        this._app.use(RouteLoader.instance().routes);

        // 启动服务器，监听端口
        this._app.listen(serverConfig.port, serverConfig.host, () => {
            Logger.debug(`[KOA] Server started, env: ${serverConfig.env}, listening on: ${serverConfig.host}:${serverConfig.port}`);
        });
    }
}


export default new Server();
