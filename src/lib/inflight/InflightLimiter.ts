import {Context as KoaContext, Middleware as KoaMiddleware, Next as KoaNext} from 'koa';
import {Logger} from '../Logger';

export interface InflightLimitConfig {
    max?: number;           // 正常并发上限（单进程，如 2000）
    maxOnFail?: number;     // 故障时收紧的并发上限（可选，应小于 max，如 200）
}

export class InflightLimiter {
    private static _instance: InflightLimiter;
    private _active: number = 0;
    private _degraded: boolean = false;
    private _highConcurrency: boolean = false; // 边沿触发：进入/离开 80% 水位只告警一次
    private _rejected: number = 0;             // 超限拒绝累计数（监控/测试用）

    private constructor() {
        this._active = 0;
        this._degraded = false;
        this._highConcurrency = false;
        this._rejected = 0;
    }

    public static instance(): InflightLimiter {
        if (!InflightLimiter._instance) {
            InflightLimiter._instance = new InflightLimiter();
        }
        return InflightLimiter._instance;
    }

    /**
     * 故障降级：收紧并发上限到 maxOnFail
     */
    public degrade(): void {
        this._degraded = true;
    }

    /**
     * 故障恢复：调回正常并发上限
     */
    public restore(): void {
        this._degraded = false;
    }

    /**
     * 当前在途请求数（监控/测试用）
     *
     * @return {number}
     */
    public active(): number {
        return this._active;
    }

    /**
     * 超限拒绝累计数（监控/测试用）
     *
     * @return {number}
     */
    public rejected(): number {
        return this._rejected;
    }

    /**
     * 生成 Koa 中间件：进入请求计数 +1，超出上限结构化拒绝（503 + Retry-After，
     * 含拒绝日志与计数）；请求结束（含异常）计数 -1
     *
     * @return {KoaMiddleware}
     */
    public middleware(getConfig: () => InflightLimitConfig | null): KoaMiddleware {
        return async (ctx: KoaContext, next: KoaNext): Promise<void> => {

            // 未配置并发上限（max<=0）→ 不限制，直接放行，避免误杀全部请求
            const cfg = getConfig() || {};
            if (!cfg.max || cfg.max <= 0) {
                await next();
                return;
            }

            // 降级阈值不高于正常上限；本请求内固定使用同一阈值（await 期间 _degraded 可能被其他请求翻转）
            const max = (this._degraded && cfg.maxOnFail > 0) ? Math.min(cfg.maxOnFail, cfg.max) : cfg.max;

            // 1. 检查并发水位
            if (this._active >= max) {
                // 结构化拒绝：503 + Retry-After，客户端可识别过载并退避；
                // 不 destroy 连接（destroy 会向客户端呈现 ECONNRESET，与网络故障无法区分）
                this._rejected += 1;
                ctx.status = 503;
                ctx.set('Retry-After', '1');
                ctx.body = {code: -1, msg: 'Server Overloaded (Concurrency Limit)'};
                Logger.warn(`[INFLIGHT] rejected, active=${this._active}, max=${max}, totalRejected=${this._rejected}`);
                return;
            }

            // 2. 占用一个槽位
            this._active += 1;
            try {
                await next();
            } finally {
                // 3. 无论成功或异常，必须释放槽位
                this._active -= 1;
                // 边沿触发：进入 80% 水位告警一次，回落后复位，避免持续高位刷屏
                const high = this._active >= max * 0.8;
                if (high && !this._highConcurrency) {
                    this._highConcurrency = true;
                    Logger.warn(`[INFLIGHT] high concurrency: ${this._active}, max=${max}`);
                } else if (!high && this._highConcurrency) {
                    this._highConcurrency = false;
                }
            }
        };
    }
}
