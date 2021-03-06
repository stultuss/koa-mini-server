import * as Koa from 'koa';
import * as koaBody from 'koa-body';
import * as koaHelmet from 'koa-helmet';
import * as koaCors from 'koa2-cors';
import RouteLoader from './apis/RouteLoader';
import {LoggerManager} from './common/logger/LoggerManager';
import {CacheFactory} from './common/cache/CacheFactory.class';

import {serverConfig} from './config/server.config';
import {cacheConfig, cacheType} from './config/cache.config';
import {dbConfig} from './config/db.config';
import {ErrorFormat} from './common/exception/ErrorFormat';
import {CommonTools} from './common/Utility';
import {OrmFactory} from './common/orm/OrmFactory.class';

class Server {
    private _initialized: boolean;
    private _app: Koa;
    
    constructor() {
        this._app = new Koa();
        this._initialized = false;
    }
    
    public async init(): Promise<any> {
        // 系统初始化(同步)
        let queue = [];
        queue.push(LoggerManager.instance().init());
        queue.push(RouteLoader.instance().init());
        queue.push(CacheFactory.instance().init(cacheType, cacheConfig));
        queue.push(OrmFactory.instance().init(dbConfig));
        await Promise.all(queue);
        
        // 完成初始化
        this._initialized = true;
    }
    
    public start(): void {
        if (!this._initialized) {
            throw new ErrorFormat(100000, 'Koa Server not initialized yet');
        }
        
        // 设置中间件
        this._app.use(koaHelmet({
            // 设置 Content Security Policy
            contentSecurityPolicy: {directives: {defaultSrc: [`'self'`]}},
            // 关闭客户端缓存
            noCache: true
        }));
        this._app.use(koaCors());
        this._app.use(koaBody({formLimit: '2048kb'}));
        this._app.use(RouteLoader.instance().routes);
        
        // 启动服务器，监听端口
        this._app.listen(serverConfig.port, serverConfig.host, () => {
            CommonTools.logger(`Koa Server started, env: ${serverConfig.env}, listening on: ${serverConfig.host}:${serverConfig.port}`);
        });
    }
}

export default new Server();