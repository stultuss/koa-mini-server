import {Context as KoaContext} from 'koa';
import * as joi from '@hapi/joi';
import {AbstractBase, MiddlewareNext, RequestSchema} from '../abstract/AbstractBase';
import {ErrorFormat} from '../../lib/Error/ErrorFormat';

class Demo extends AbstractBase {
    
    constructor() {
        super();
        this.method = 'all'; // 'all' | 'post' | 'get'
        this.uri = '/v1/demo';
        this.type = 'application/json; charset=utf-8';
        this.schema = {
            name: joi.number().required()
        };
    }
    
    public async handle(ctx: KoaContext, req: RequestSchema, next: MiddlewareNext): Promise<any> {
        const params = req.aggregatedParams;
        
        if (1) {
            throw new ErrorFormat(20001, "default error message");
        }
        
        return params;
    };
}

module.exports = new Demo();
