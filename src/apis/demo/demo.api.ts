import * as joi from '@hapi/joi';
import {Context as KoaContext} from 'koa';
import {AbstractBase, MiddlewareNext, RequestSchema} from '../abstract/AbstractBase';
import {ErrorFormat} from '../../common/exception/ErrorFormat';
import {CacheFactory} from '../../common/cache/CacheFactory.class';

interface RequestParams {
    name: string
}

class Demo extends AbstractBase {
    
    constructor() {
        super();
        this.method = 'all'; // 'all' | 'post' | 'get'
        this.uri = '/v1/demo';
        this.type = 'application/json; charset=utf-8';
        this.schema = {
            id: joi.number().required(),
            name: joi.string().required()
        };
    }
    
    public async handle(ctx: KoaContext, req: RequestSchema, next: MiddlewareNext): Promise<any> {
        const params = req.aggregatedParams as RequestParams;
        
        // 返回结构
        const response: any = params;
        
        if (params.name == 'error') {
            throw new ErrorFormat(20001, "default error message");
        }
        
        if (params.name == 'redis') {
            response.incr = await CacheFactory.instance().getCache().incr('INCR');
        }
        
        return response;
    };
}

module.exports = new Demo();