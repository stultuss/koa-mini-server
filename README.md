# Koa Mini Server

> 快速创建最小化 Koa 服务器的脚手架，已现代化改造（Koa 3 + TypeORM 0.3 + Redis 4）。

## 技术栈

- 运行时：Node.js >= 22
- Web：Koa 3 + `@koa/router` 15 + `koa-body` 8 + `helmet` 8 + `@koa/cors`
- 存储：MySQL（TypeORM 0.3，mysql2 驱动）+ Redis 4
- 其他：winston 3（按天滚动日志）、joi 18 参数校验、axios HTTP 请求

## 特性

- [x] 跨域处理
- [x] 参数验证（joi）
- [x] 日志输出（winston 按天滚动 + 控制台）
- [x] 封装缓存库（redis 4，自动重连、分布式锁、分片）
- [x] 封装数据库（TypeORM 0.3 多数据源 + 分库分表）
- [x] 数据映射模型（Entity VO + Redis 缓存）
- [ ] 灰度
- [ ] 限流

## 启动

```bash
npm install
npm run build      # tsc 编译到 build/
npm run dev        # ts-node 开发模式
npm run start      # 编译并启动
```

默认监听 `0.0.0.0:8080`（可用 `PORT` 覆盖）。依赖本地 MySQL（3306）与 Redis（6379）。
首次运行需要先初始化数据库（两个库 `db_demo_0` / `db_demo_1`）：

```bash
bash schema/dev/schema_0.sh
bash schema/dev/schema_1.sh
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `8080` | HTTP 监听端口 |
| `LOGGER_LEVEL` | `debug` | 日志级别 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PWD` | `127.0.0.1` / `6379` / 无 | Redis 连接 |
| `DB_CONFIG_HOST` / `DB_CONFIG_PORT` / `DB_CONFIG_USERNAME` / `DB_CONFIG_PASSWORD` | `127.0.0.1` / `3306` / `root` / `qx#Xim!0Euhwc` | MySQL 连接（默认密码为本地假值，勿用于生产） |
| `DB_CONFIG_DATABASE_0` / `DB_CONFIG_DATABASE_1` | `db_demo_0` / `db_demo_1` | 两个分库名 |

## 路由

| 路由 | 说明 |
| --- | --- |
| `/v1/demo?id=1&name=xxx` | 演示接口：返回参数；`name=error` 测试报错；`name=redis` 测试缓存；`name=orm` 测试数据库/分表 |

请求返回统一结构：

```json
{ "code": 0, "payload": { ... } }
```

## 目录

- `src/`：源码（apis / config / entity / lib / models / service）
  - `apis/`：路由入口（`*.api.ts` 自动加载，支持 `export default` 与 `module.exports`）
  - `lib/`：基础库（api / cache / exception / logger / model / orm / router / setting / tools）
  - `entity/`：TypeORM 实体（`@ShardTable` / `@ShardColumn` / `@CacheName` 等分表装饰器）
- `schema/`：数据库初始化脚本
- `logs/`：按天滚动的运行日志

## 如何新增接口

在 `src/apis/` 下创建 `demo.api.ts`：

```typescript
import joi from 'joi';
import {AbstractAPI, ApiContext, MiddlewareNext, RequestSchema} from '../lib/api/abstract/AbstractAPI';

class Demo extends AbstractAPI {

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

    public async handle(ctx: ApiContext, req: RequestSchema, next: MiddlewareNext): Promise<any> {
        return req.aggregatedParams;
    }
}

export default new Demo();
```

构建后 `build/apis/**/*.api.js` 会被自动注册。
