import joi from 'joi';
import {Context as KoaContext, Middleware as KoaMiddleware, Request as KoaRequest, Next as KoaNext} from 'koa';
import {ErrorMessage} from '../../exception/ErrorMessage';
import {JsonTools} from '../../tools/JsonTools';
import {Logger} from '../../Logger';
import {Utils} from '../../Utils';
import {CacheFactory} from '../../cache/CacheFactory.class';
import {RedisLock, REDIS_LOCK_DEFAULT} from '../../lock/RedisLock';
import {RandomTools} from '../../tools/RandomTools';
import {serverConfig} from '../../../config/server.config';

export const METHOD_ALL = 'all';
export const METHOD_POST = 'post';
export const METHOD_GET = 'get';

export interface ApiContext extends KoaContext {
    remoteIp: string;
    request: ApiRequest;
}

export interface ApiRequest extends KoaRequest {
    aggregatedParams?: { [key: string]: any };
}

export interface ApiResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

export interface ApiError extends ApiResponse {
    stack?: string;  // 开发环境显示堆栈
}

export interface ApiNext extends KoaNext {
    (): Promise<any>;
}

export abstract class AbstractAPI {

    public method: string;
    public uri: string;
    public type: string;
    public validate: boolean = true; // 是否验证参数
    public schema: joi.SchemaMap = {};
    public isResponseSchema: boolean = true; // 是否默认返回结构化数据
    public readonly REQ_SLOW_LOG_THRESHOLD = 3000;
    public extra: any;
    public serializeBy: string[] = []; // 请求队列限制名单（参数名）：由各接口自行定义，命中即按参数值串行化

    public abstract handle(ctx: ApiContext, req: ApiRequest, next: ApiNext): Promise<any>;

    /**
     * 注册路由处理中间件。
     * 此方法返回一个数组，包含路由 URI 和一系列中间件函数，用于处理请求。
     * 这些中间件按顺序执行，包括参数解析、参数验证和实际的请求处理。
     *
     * @returns {Array<string | KoaMiddleware>} 包含路由 URI 和中间件函数的数组。
     */
    public register(): Array<string | KoaMiddleware> {
        return [
            this.uri,
            this._errorHandler(),       // 全局错误处理
            this._requestLogger(),      // 请求日志
            this._parseParams(),        // 参数解析
            this._validate(),           // 参数验证
            this._serialize(),          // 请求队列（按业务参数串行化）
            this._performanceMonitor(), // 性能监控
            this._execute(),            // 业务执行
            this._responseLogger()      // 响应日志
        ];
    };

    /**
     * 解析参数并格式化数字类型的参数
     *
     * @private
     * @returns {KoaMiddleware} Koa 中间件函数
     */
    protected _parseParams(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            // 合并路由参数、查询参数和请求体参数
            const params = {
                ...(ctx.params as Record<string, any> || {}),
                ...ctx.request.query,
                ...((ctx.request.body as any) || {}),
                ...((ctx.request.files as any) || {})
            };

            // 处理外部传入的数据 RawJson(不处理转换）
            this.extra = JsonTools.stringify(ctx.request.body);

            // 遍历合并后的参数对象，将字符串数字转换为数字类型
            // 将格式化后的参数添加到请求对象的 aggregatedParams 属性中
            ctx.request.aggregatedParams = _formatParams(params);
            await next();
        };

        // 检查转化后的数字是否有效
        function _isValidNumber(num: number, original: string): boolean {
            return !isNaN(num)
                && isFinite(num)
                && String(num)?.length === original?.length
                && String(num) === String(original);
        }

        // 格式化参数
        function _formatParams(params: Record<string, any>): Record<string, any> {
            for (const [key, value] of Object.entries(params)) {
                // 如果参数值为空或参数值的字符串长度大于 14，不进行数字格式化，跳过本次循环
                if (Utils.isEmpty(value) || String(value)?.length > 14) {
                    // BigInt大于14位会丢失精度
                    continue;
                }

                // 将参数值转换为数字类型, 如果转换失败，不进行处理
                // 检查转换后的数字是否有效且转换前后字符串长度一致
                // 检查转换后的数字和原始字符串是否一致
                const formatted = Number(value);
                if (_isValidNumber(formatted, value)) {
                    params[key] = formatted;
                }
            }
            return params;
        }
    }

    /**
     * 进行参数验证的中间件方法
     *
     * @private
     * @returns {KoaMiddleware} 返回一个 Koa 中间件函数
     */
    protected _validate(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            // 如果需要验证参数，则使用 joi 进行参数验证
            if (!this.validate || !this.schema || Object.keys(this.schema)?.length == 0) {
                await next();
                return;
            }

            // 创建验证 schema
            const schema = joi.object().keys(this.schema);
            const {error} = schema.validate(
                ctx.request.aggregatedParams,
                {
                    abortEarly: false,     // 返回所有错误
                    allowUnknown: true,    // 允许未知字段
                    stripUnknown: false    // 保留未知字段
                }
            );

            // 使用 joi 对合并后的参数进行验证
            if (error) {
                throw new ErrorMessage(10002, error.message);
            }

            await next();
        };
    }

    /**
     * 请求队列：按业务参数串行化（Redis 分布式互斥，跨进程、跨接口生效）
     *
     * - 参数名由各接口的 serializeBy 定义；aggregatedParams 中存在名单内参数名且值非空时，
     *   队列键 = `${参数名}:${参数值}`（如 userId:1）；
     * - 锁键不含路由：同一业务键跨接口共享队列，多个接口同时请求同一用户数据时串行；
     * - 排队获取超时抛 10007（QUEUE_TIMEOUT）；请求结束（含异常）必释放锁；
     * - Redis 故障 fail-open 放行并去重记日志（队列是一致性助手，不做保护层）；
     * - 非严格 FIFO：竞争时轮询抢锁，只保证互斥。
     */
    protected _serialize(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            // 未配置限制名单 → 不排队
            if (!this.serializeBy || this.serializeBy.length === 0) {
                await next();
                return;
            }

            // 取第一个"在名单内且值非空"的参数作为队列键
            const params = ctx.request.aggregatedParams || {};
            let queueKey: string | null = null;
            for (const name of this.serializeBy) {
                const value = params[name];
                if (value !== undefined && value !== null && value !== '') {
                    queueKey = `${name}:${value}`;
                    break;
                }
            }
            if (!queueKey) {
                await next();
                return;
            }

            const cache = CacheFactory.instance().getCache(0);
            // 锁键不含路由：同一业务键跨接口共享队列
            const key = `${serverConfig.name}:queue:${queueKey}`;
            const token = RandomTools.uuid(); // 持有者标识：RFC 4122 v4，跨进程构造性唯一

            let acquired = false;
            try {
                acquired = await RedisLock.acquire(cache, key, token);
            } catch (e) {
                // Redis 故障 fail-open：放行（去重日志）
                Logger.warn(`[QUEUE] redis lock error, pass through: ${e instanceof Error ? e.message : String(e)}`);
                await next();
                return;
            }

            // 排队超时：结构化拒绝
            if (!acquired) {
                throw new ErrorMessage(10007, queueKey, REDIS_LOCK_DEFAULT.timeoutMs);
            }

            try {
                await next();
            } finally {
                // 无论成功或异常，必须释放锁
                await RedisLock.release(cache, key, token).catch((e) => {
                    Logger.warn(`[QUEUE] release error: ${e instanceof Error ? e.message : String(e)}`);
                });
            }
        };
    }

    /**
     * 性能监控
     *
     * @returns
     */
    protected _performanceMonitor(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            const startTime = process.hrtime(); // 获取高精度时间
            try {
                await next();
            } finally {
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const duration = seconds * 1000 + nanoseconds / 1000000;
                if (duration > this.REQ_SLOW_LOG_THRESHOLD) { // 超过 3 秒的请求记录警告日志
                    Logger.warn({
                        type: `[API:REQ_SLOW:${duration}ms]`,
                        uri: this.uri,
                        ip: ctx.remoteIp,
                        duration,
                    });
                } else {
                    Logger.warn({
                        type: `[API:CONSUME]`,
                        uri: this.uri,
                        ip: ctx.remoteIp,
                        duration,
                    });
                }
            }
        };
    }

    /**
     * 代码执行
     *
     * @private
     */
    protected _execute(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            try {
                // 执行业务逻辑
                const data = await this.handle(ctx, ctx?.request, next);

                if (!this.isResponseSchema) {
                    // 如果不需要返回结构化数据，则直接返回数据
                    ctx.body = data;
                } else {
                    // 默认返回结构化数据
                    ctx.body = {
                        code: 0,
                        msg: 'succeed',
                        data: data
                    };
                }

                await next();
            } catch (error) {
                throw error;
            }
        };
    }

    /**
     * 全局错误处理中间件
     *
     * @returns
     */
    protected _errorHandler(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            try {
                await next();
            } catch (error) {
                ctx.body = ErrorMessage.format(error);
                Logger.info({
                    type: '[API:ERROR]',
                    uri: this.uri,
                    ip: ctx.remoteIp,
                    params: ctx.request.aggregatedParams,
                    response: ctx.body,
                });
            }
        };
    }

    /**
     * 请求日志记录中间件
     *
     * @returns
     */
    protected _requestLogger(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            // 合并路由参数、查询参数和请求体参数
            const params = {
                ...(ctx.params as Record<string, any> || {}),
                ...ctx.request.query,
                ...((ctx.request.body as any) || {}),
                ...((ctx.request.files as any) || {})
            };

            ctx.remoteIp = Utils.getIP(ctx.request.req);
            Logger.debug({
                type: '[API:REQ]',
                uri: this.uri,
                ip: ctx.remoteIp,
                params: params,
            });
            await next();
        };
    }

    /**
     * 响应日志记录中间件
     *
     * @returns
     */
    protected _responseLogger(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            Logger.debug({
                type: '[API:RES]',
                uri: this.uri,
                ip: ctx.remoteIp,
                params: ctx.request.aggregatedParams,
                response: ctx.body,
            });
            await next();
        };
    }
}
