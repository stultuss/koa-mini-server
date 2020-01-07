import * as Koa from 'koa';
import * as koaBody from 'koa-body';
import * as koaCors from 'koa2-cors';

import RouteLoader from './apis/RouteLoader';

export interface IConfigs {
    server: { host: string, port: number, allowDomain: string[] },
}

class Server {
    private _initialized: boolean;
    private _app: Koa;
    private _configs: IConfigs;
    
    constructor() {
        this._app = new Koa();
        this._initialized = false;
    }
    
    public async init(configs: IConfigs): Promise<any> {
        // 保存配置
        this._configs = configs;
        
        // 系统初始化(同步)
        let queue = [];
        queue.push(RouteLoader.instance().init());
        
        await Promise.all(queue);
        
        // 完成初始化
        this._initialized = true;
    }
    
    public start(): void {
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
        this._app.use(RouteLoader.instance().routes);
        
        // 启动服务器，监听端口
        this._app.listen(this._configs.server.port, this._configs.server.host, () => {
            console.log(`Koa Server started, listening on: ${this._configs.server.host}:${this._configs.server.port}`);
        });
    }
}

export default new Server();