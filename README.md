# Koa Mini Server

> 最小化 Koa 服务器脚手架（Koa 3 + TypeORM 0.3 + Redis 4），内置完整的限流 / 熔断 / 并发保护与动态配置。

## 技术栈

- 运行时：Node.js >= 22
- Web：Koa 3 + `@koa/router` 15 + `koa-body` 8 + `helmet` 8 + `@koa/cors`
- 存储：MySQL（TypeORM 0.3，mysql2 驱动）+ Redis（`redis` 4 客户端）
- 缓存：`lru-cache` 11（进程内 LRU）+ Redis（分布式共享、Lua CAS）
- 其他：winston 3（按天滚动日志）、joi 18 参数校验、axios、process-stats-sampler（进程采样）

## 特性

- [x] 跨域处理
- [x] 参数验证（joi）
- [x] 日志输出（winston 按天滚动 + 控制台）
- [x] 封装缓存库（Redis 4：自动重连、Lua 原语、版本号 CAS）
- [x] 封装数据库（TypeORM 0.3 多数据源 + crc32 分库 + `uid % 10` 分表）
- [x] 数据映射模型（Entity VO + 版本号 CAS 缓存）
- [x] 限流 / 熔断 / 并发保护（server 层洋葱中间件，配置动态生效）：
- [x] Inflight 并发计数器（进程内，Redis 故障时降级收紧阈值）
- [x] 请求超时熔断（默认 5s，支持按路径覆盖 / 排除）
- [x] IP 桶（进程内 LRU）+ Redis 全局桶 + 接口桶（多桶合并单 Lua，一次 Redis 访问）

## 启动

```bash
npm install
npm run build      # tsc 编译到 build/
npm run start      # 编译并启动（等价 tsc && node ./build/index.js）
```

> 已移除 ts-node / tsx 开发模式：分片实体只在编译后的 JS 中生成（entity 分片类由构建产物
> 生成），从 TS 源直接运行无法得到分片类，因此统一走 tsc 构建。

默认监听 `0.0.0.0:8080`（可用 `PORT` 覆盖）。依赖本地 MySQL（3306）与 Redis（6379，无持久化）。
首次运行需要先初始化两个分库：

```bash
bash schema/dev/schema_0.sh   # db_demo_0（logs + demo_0~demo_9）
bash schema/dev/schema_1.sh   # db_demo_1（logs + demo_0~demo_9）
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `8080` | HTTP 监听端口 |
| `LOGGER_LEVEL` | `debug` | 日志级别 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PWD` | `127.0.0.1` / `6379` / 无 | Redis 连接 |
| `DB_CONFIG_HOST` / `DB_CONFIG_PORT` / `DB_CONFIG_USERNAME` / `DB_CONFIG_PASSWORD` | `127.0.0.1` / `3306` / `root` / `qx#Xim!0Euhwc` | MySQL 连接（默认密码为本地假值，勿用于生产） |

> 分库名（db_demo_0 / db_demo_1）当前在 `src/config/db.config.ts` 中硬编码，未做环境变量。

## 运行配置（settings/global.json）

本项目使用以下键（其余键为其他服务共享，勿删改）：

```json
{
  "inflight":    { "max": 2000, "maxOnFail": 200 },
  "timeout":     { "default": 5000, "overrides": {}, "excludes": ["/v2/trade/complete/"] },
  "rateIpLimit": { "rate": 100, "capacity": 100 },
  "rateLimit": {
    "global":    { "rate": 2000, "capacity": 6000 },
    "api":       { "rate": 500, "capacity": 500, "apis": ["/v1/demo"] },
    "failMode":  "open"
  }
}
```

- `inflight`：并发计数器上限；`maxOnFail` 为 Redis 故障时收紧的降级上限；
- `timeout`：接口超时熔断；`excludes` 以 `/` 结尾为前缀匹配，否则精确匹配；
- `rateIpLimit`：IP 级桶（进程内 LRU，按客户端防滥用）；
- `rateLimit`：Redis 层（保护共享 MySQL）——`global` 集群级全局桶，`api` 接口桶，
  `api.apis` 是**限制名单**（名单内接口走 global+api 两桶，名单外只走 global 桶），
  `failMode` 为 Redis 故障策略（`open` = 放行并降级 inflight / `close` = 结构化拒绝）；
- 所有配置每次请求实时读取（`SettingManager.dynamicCallback`），gRPC 下发 sync 后立即生效；
- 非法配置仅去重记录一条错误日志并跳过对应桶，不抛错、不中断服务。

## 路由

| 路由 | 说明 |
| --- | --- |
| `/check` | 自检接口：返回服务状态与当前时间；`test=log` 测试 Logs 列表缓存 |
| `/v1/demo?userId=1&name=xxx` | 演示接口（位于限流限制名单内） |

`/v1/demo` 的 `name` 钩子：

| name | 说明 |
| --- | --- |
| `error` | 抛默认错误（code 10000） |
| `redis` | Redis INCR 计数 |
| `orm` | 数据库读写：按 `crc32(uid) % 2` 分库 + `uid % 10` 分表 |
| `sleep&ms=2000` | 挂起指定毫秒（测试超时熔断，缺省 2s） |
| `saveIncr` | 读改写 `status + 1`（测试并发丢更新） |
| `getIncr` | 读取当前 `status` |

请求返回统一结构：

```json
{ "code": 0, "msg": "succeed", "data": { ... } }
```

## 中间件洋葱顺序（外 → 内）

1. Inflight 并发计数器（进程准入，Redis 故障时降级收紧）
2. 请求超时熔断（整条链路预算，超时返回 code 10006 并释放并发槽位）
3. IP 桶（进程内 LRU）
4. Redis 全局桶 + 接口桶（一次 Lua 原子判断）
5. 业务路由（接口内可选请求队列：`AbstractAPI.serializeBy` 定义参数名， 命中即按参数值进入 Redis 分布式队列串行化，跨进程、跨接口共享）

## 目录

- `src/`：源码
  - `apis/`：路由入口（`*.api.ts` 自动加载，支持 `export default` 与 `module.exports`）
  - `lib/middleware/`：限流 / 熔断中间件（RateLimit、RateIpLimit、TimeoutLimit）
  - `lib/inflight/`：InflightLimiter（并发计数器单例）
  - `lib/tokenbucket/`：令牌桶（TokenBucket 内存桶 / RedisTokenBucket Redis 桶，单 Lua）
  - `lib/setting/`：SettingManager（配置加载 + gRPC 动态下发）
  - `lib/task/`：TaskManager（周期任务，如进程采样 monitor）
  - `lib/`：其余基础库（api / cache / exception / logger / model / orm / router / tools）
  - `entity/`：TypeORM 实体（`@ShardTable` / `@ShardColumn` / `@CacheName` 等分表装饰器）
- `schema/`：数据库初始化脚本
- `settings/`：JSON 运行配置
- `logs/`：按天滚动的运行日志；`stats.log`：进程采样输出（monitor 每 30s 覆写）

## 如何新增接口

在 `src/apis/` 下创建 `demo.api.ts`：

```typescript
import joi from 'joi';
import {AbstractAPI, ApiContext, ApiNext, ApiRequest, METHOD_ALL} from '../lib/api/abstract/AbstractAPI';

class Demo extends AbstractAPI {

    constructor() {
        super();
        this.method = METHOD_ALL; // 'all' | 'post' | 'get'
        this.uri = '/v1/demo';
        this.type = 'application/json; charset=utf-8';
        this.schema = {
            id: joi.number().required(),
            name: joi.string().required()
        };
        // 可选：请求队列限制名单（参数名）——请求带 userId 时按 userId 串行化
        this.serializeBy = ['userId'];
    }

    public async handle(ctx: ApiContext, req: ApiRequest, next: ApiNext): Promise<any> {
        return req.aggregatedParams;
    }
}

export default new Demo();
```

构建后 `build/apis/**/*.api.js` 会被自动注册；如需走接口限流，把路径加进
`settings/global.json` 的 `rateLimit.api.apis` 限制名单。
