import * as joi from '@hapi/joi';
import {Context as KoaContext} from 'koa';
import {AbstractBase, MiddlewareNext, RequestSchema} from '../abstract/AbstractBase';
import {ErrorFormat} from '../../common/exception/ErrorFormat';
import {CacheFactory} from '../../common/cache/CacheFactory.class';
import {DemoService} from '../../service/demo.service';

interface RequestParams {
    id: number,
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
        
        // 测试报错
        if (params.name == 'error') {
            throw new ErrorFormat(20001, "default error message");
        }
        
        // 测试缓存
        if (params.name == 'redis') {
            response.incr = await CacheFactory.instance().getCache().incr('INCR');
        }
        
        // 测试数据库 / orm
        if (params.name == 'orm') {
            const demoModel = await DemoService.getDemo(params.id);
            response.demo = await demoModel.format();
        }
        
        return response;
    };
}

module.exports = new Demo();