Koa Mini Server
=========================

> Quickly create a minimal Koa server.

### Feature

- [x] 跨域处理
- [x] 参数验证
- [x] 日志输出
- [x] 封装缓存库
- [x] 封装数据库
- [x] 数据映射模型
- [ ] 灰度
- [ ] 限流

## Usage

```bash
npm install
npm start
```

## How to begin

1. create a `demo.api.ts` file in `~/src/apis/`

``` typescript
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
```

2. Run `tsc` and `node ./build/index.js`

3. The website server worked,  `http://127.0.0.1:8001/v1/demo` .

