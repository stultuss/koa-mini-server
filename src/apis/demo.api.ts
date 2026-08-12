import joi from 'joi';
import {AbstractAPI, ApiContext, ApiRequest, ApiNext, METHOD_ALL} from '../lib/api/abstract/AbstractAPI';
import {ErrorMessage} from '../lib/exception/ErrorMessage';
import {CacheFactory} from '../lib/cache/CacheFactory.class';
import {DemoService} from '../service/demo.service';
import {TimeTools} from '../lib/tools/TimeTools';
import {DemoModel} from '../models/demo.model';

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

        // 测试并发 status +1（读改写，观察是否丢更新）
        if (params.name == 'saveIncr') {
            const model = new DemoModel(params.id);
            let demo = await model.get();
            if (!demo) {
                demo = model.create();
                demo.name = 'test';
                demo.openId = params.id.toString();
                demo.createTime = TimeTools.getTime();
                demo.status = 0;
                await demo.insert();
            }
            demo.status += 1;
            await demo.save();
            response.status = demo.status;
            response.uid = params.id;
        }

        // 测试读取当前 status
        if (params.name == 'getIncr') {
            const model = new DemoModel(params.id);
            const demo = await model.get();
            response.status = (demo) ? demo.status : null;
            response.uid = params.id;
        }
        
        return response;
    };
}

export default new API();
