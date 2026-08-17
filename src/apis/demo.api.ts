import joi from 'joi';
import {AbstractAPI, ApiContext, ApiRequest, ApiNext, METHOD_ALL} from '../lib/api/abstract/AbstractAPI';
import {ErrorMessage} from '../lib/exception/ErrorMessage';
import {CacheFactory} from '../lib/cache/CacheFactory.class';
import {DemoService} from '../service/demo.service';
import {TimeTools} from '../lib/tools/TimeTools';
import {DemoModel} from '../models/demo.model';
import {Utils} from '../lib/Utils';

class API extends AbstractAPI {
    
    constructor() {
        super();
        this.method = METHOD_ALL; // 'all' | 'post' | 'get'
        this.uri = '/v1/demo';
        this.type = 'application/json; charset=utf-8';
        // 请求队列限制名单（参数名，接口内定义）：userId 命中即按 userId 串行化（saveIncr 读改写互斥）
        this.serializeBy = ['userId'];
        this.schema = {
            userId: joi.number().required(),
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

        // 测试超时熔断（挂起指定毫秒，缺省 2s）
        if (params.name == 'sleep') {
            await Utils.sleep(Number(params.ms) || 2000);
        }
        
        // 测试数据库 / orm
        if (params.name == 'orm') {
            const demoModel = await DemoService.getDemo(params.userId);
            response.demo = await demoModel.format();
        }

        // 测试并发 status +1（读改写，观察是否丢更新）
        if (params.name == 'saveIncr') {
            const model = new DemoModel(params.userId);
            let demo = await model.get();
            if (!demo) {
                demo = model.create();
                demo.name = 'test';
                demo.openId = params.userId.toString();
                demo.createTime = TimeTools.getTime();
                demo.status = 0;
                await demo.insert();
            }
            demo.status += 1;
            await demo.save();
            response.status = demo.status;
            response.uid = params.userId;
        }

        // 测试读取当前 status
        if (params.name == 'getIncr') {
            const model = new DemoModel(params.userId);
            const demo = await model.get();
            response.status = (demo) ? demo.status : null;
            response.uid = params.userId;
        }
        
        return response;
    };
}

export default new API();
