import * as _ from 'underscore';
import * as joi from '@hapi/joi';
import {Context as KoaContext, Middleware as KoaMiddleware, Request as KoaRequest} from 'koa';
import {ErrorFormat} from '../../common/exception/ErrorFormat';
import {CommonTools} from '../../common/Utility';
import {serverConfig} from '../../config/server.config';

export interface RequestSchema extends KoaRequest {
    aggregatedParams?: { [key: string]: any };
}

export interface ResponseSchema {
    code: number;
    msg?: string;
    payload?: any;
}

export type MiddlewareNext = () => Promise<any>;

export abstract class AbstractBase {
    
    public method: string;
    public uri: string;
    public type: string;
    public schema: joi.SchemaMap = {};
    
    public abstract handle(ctx: KoaContext, req: RequestSchema, next: MiddlewareNext): Promise<any>;
    
    public register(): Array<string | KoaMiddleware> {
        return [this.uri, this._paramsPares(), this._validate(), this._execute()];
    };
    
    
    /**
     * 参数解析
     *
     * @private
     */
    protected _paramsPares(): KoaMiddleware {
        return async (ctx: KoaContext, next: MiddlewareNext): Promise<void> => {
            let aggregatedParams = Object.assign({}, ctx.params, ctx.request.query, ctx.request.body);
            
            // 将数字类型的参数 format 转成
            for (let i of Object.keys(aggregatedParams)) {
                const formatted = Number(aggregatedParams[i]);
                if (_.isNumber(formatted) && !_.isNaN(formatted)) {
                    aggregatedParams[i] = formatted;
                }
            }
            
            (ctx.request as RequestSchema).aggregatedParams = aggregatedParams;
            await next();
        };
    }
    
    /**
     * 参数验证
     *
     * @private
     */
    protected _validate(): KoaMiddleware {
        return async (ctx: KoaContext, next: MiddlewareNext): Promise<void> => {
            try {
                // only support joi version less 16
                joi.validate((ctx.request as RequestSchema).aggregatedParams, joi.object().keys(this.schema), (e: Error) => {
                    if (e) {
                        throw new ErrorFormat(10002, e.message);
                    }
                });
                await next();
            } catch (e) {
                ctx.body = this.handleError(e);
            }
        };
    }
    
    /**
     * 代码执行
     *
     * @private
     */
    protected _execute(): KoaMiddleware {
        return async (ctx: KoaContext, next: MiddlewareNext): Promise<void> => {
            try {
                ctx.body = this.handleResponse(await this.handle(ctx, ctx.request, next));
                await next();
            } catch (e) {
                ctx.body = this.handleError(e);
            }
        };
    }
    
    /**
     * 构建返回数据
     *
     * @param payload
     */
    public handleResponse(payload: any): ResponseSchema {
        return {
            code: 0,
            payload: payload
        };
    }
    
    public handleError(e: Error | ErrorFormat | number | string): ResponseSchema {
        // 打印日志
        CommonTools.logger(e, CommonTools.LOGGER_TYPE_DEBUG);
        
        // 打印报错
        if (serverConfig.env === 'development') {
            console.log(e);
        }
        
        // 默认报错
        let response: ResponseSchema = {
            code: 1
        };
        
        // 根据报错类型处理报错信息
        if (e instanceof ErrorFormat) {
            // 抛出 ErrorFormat 报错
            response.code = e.code;
            response.msg = e.message;
        } else if (typeof e === 'number') {
            // 抛出 ErrorCode 报错
            response.code = e;
        } else if (e instanceof Error) {
            // 抛出未被定义的报错
            response.msg = e.message;
        } else {
            // 抛出未知错误
            response.msg = e;
        }
        
        // 删除空报错信息
        if (response.msg == '%s' || response.msg == '') {
            delete response.msg;
        }
        
        return response;
    }
}