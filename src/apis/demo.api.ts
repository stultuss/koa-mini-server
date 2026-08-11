import joi from 'joi';
import {AbstractAPI, ApiContext, ApiRequest, ApiNext, METHOD_ALL} from '../lib/api/abstract/AbstractAPI';
import {ErrorMessage} from '../lib/exception/ErrorMessage';
import {CacheFactory} from '../lib/cache/CacheFactory.class';
import {DemoService} from '../service/demo.service';

class API extends AbstractAPI {
    
    constructor() {
        super();
        this.method = METHOD_ALL; // 'all' | 'post' | 'get'
        this.uri = '/v1/demo';
        this.type = 'application/json; charset=utf-8';
        this.schema = {
            id: joi.number().required(),
            name: joi.string().required()
        };
    }
    
    public async handle(ctx: ApiContext, req: ApiRequest, next: ApiNext): Promise<any> {
        const params = req.aggregatedParams;
        
        // 返回结构
        const response: any = params;
        
        // 测试报错
        if (params.name == 'error') {
            throw new ErrorMessage(10000, "default error message");
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

export default new API();
