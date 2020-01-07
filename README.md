Koa Mini Server
=========================

> Quickly create a minimal Koa server.

### Feature

- [x] 跨域处理
- [x] 参数验证
- [ ] 封装缓存库
- [ ] 封装数据库
- [ ] 数据映射模型
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
```

2. Run `tsc` and `node ./build/index.js`

3. The website server worked,  `http://127.0.0.1:8001/v1/demo` .

