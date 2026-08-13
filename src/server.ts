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
import {TaskManager} from './lib/task/TaskManager';
import {ShellTools} from './lib/tools/ShellTools';
import {InflightLimiter} from './lib/inflight/InflightLimiter';
import {requestTimeout} from './lib/middleware/TimeoutLimit';
import {rateLimit} from './lib/middleware/RateLimit';
import {rateIpLimit} from './lib/middleware/RateIpLimit';

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

        // 启动脚本
        TaskManager.instance().init([
            [ShellTools.monitor, [path.join(__dirname, '..', 'stats.log'), 30], 30]
        ]);

        // 使用 callback 的方法把配置中心的动态数据传递出来。
        const dynamicCallback = SettingManager.instance().dynamicCallback.bind(SettingManager.instance());

        // 本地并发计数器（进程内，保护单机 Event Loop；Redis 故障时降级收紧阈值）
        this._app.use(InflightLimiter.instance().middleware(dynamicCallback('global', 'inflight', false)));

        // 请求超时熔断（整条请求链路超时，超时返回结构化错误并释放并发槽位；配置动态生效）
        this._app.use(requestTimeout(dynamicCallback('global', 'timeout', false)));

        // 进程 IP 级桶（进程内 LRU）
        this._app.use(rateIpLimit(dynamicCallback('global', 'rateIpLimit', false)));

        // 全局桶 + 接口桶（配置来自 settings/global.json -> rateLimit，保护共享 MySQL）
        this._app.use(rateLimit(dynamicCallback('global', 'rateLimit', false), InflightLimiter.instance()));

        // 其他中间件
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
