import joi from 'joi';
import {Context as KoaContext, Middleware as KoaMiddleware, Request as KoaRequest, Next as KoaNext} from 'koa';
import {ErrorMessage} from '../../exception/ErrorMessage';
import {JsonTools} from '../../tools/JsonTools';
import {Logger} from '../../Logger';
import {Utils} from '../../Utils';
import {CacheFactory} from '../../cache/CacheFactory.class';

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
    public rateLimit: {
        rate: number;
        capacity: number;
        keyBy?: (params: Record<string, any>, ctx: ApiContext) => string
    } = null; // 令牌桶限流，null =关闭
    public serializeBy: (params: Record<string, any>, ctx: ApiContext) => string | null = null; // 按业务键串行化（如 uid），返回 null 则放行

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
            this._rateLimit(),          // 令牌桶限流
            this._serialize(),          // 按业务键串行化（请求队列）
            this._validate(),           // 参数验证
            this._performanceMonitor(), // 性能监控
            this._execute(),            // 业务执行
            this._responseLogger()      // 响应日志
        ];
    };

    /**
     * 令牌桶限流中间件（默认按请求 IP 作为限流键）
     *
     * @return {KoaMiddleware}
     * @protected
     */
    protected _rateLimit(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            if (!this.rateLimit) {
                await next();
                return;
            }

            const {rate, capacity} = this.rateLimit;
            const keyBy = this.rateLimit.keyBy || ((params: Record<string, any>, c: ApiContext) => c.remoteIp);
            const key = keyBy(ctx.request.aggregatedParams, ctx);
            const ok = await CacheFactory.instance().getCache(0).tokenBucket(`rl:${this.uri}:${key}`, rate, capacity);
            if (!ok) {
                throw new ErrorMessage(10000, 'rate limit exceeded');
            }

            await next();
        };
    }

    /**
     * 请求串行化中间件：按业务键（如 uid）排队，同一键串行执行；无键直接放行
     *
     * @return {KoaMiddleware}
     * @protected
     */
    protected _serialize(): KoaMiddleware {
        return async (ctx: ApiContext, next: ApiNext): Promise<void> => {
            if (!this.serializeBy) {
                await next();
                return;
            }

            const params = ctx.request.aggregatedParams || {};
            const serializeKey = this.serializeBy(params, ctx);
            if (serializeKey == null || serializeKey === '') {
                await next();
                return;
            }

            const lockKey = `serial:${this.uri}:${serializeKey}`;
            const lockValue = `${process.pid}:${Date.now()}:${Math.random()}`;
            const cache = CacheFactory.instance().getCache(0);

            if (!await this._acquireLock(cache, lockKey, lockValue)) {
                throw new ErrorMessage(10000, 'request queue timeout');
            }

            try {
                await next();
            } finally {
                await cache.lockRelease(lockKey, lockValue);
            }
        };
    }

    /**
     * 轮询获取分布式锁（带超时）
     *
     * @param {RedisCache} cache
     * @param {string} lockKey
     * @param {string} lockValue
     * @param {number} timeoutMs
     * @param {number} intervalMs
     * @return {Promise<boolean>}
     * @private
     */
    private async _acquireLock(
        cache: any,
        lockKey: string,
        lockValue: string,
        timeoutMs: number = 5000,
        intervalMs: number = 20
    ): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await cache.lockAcquire(lockKey, lockValue, 30)) {
                return true;
            }
            await Utils.sleep(intervalMs);
        }
        return false;
    }

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
