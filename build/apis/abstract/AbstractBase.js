"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const joi = require("@hapi/joi");
const ErrorFormat_1 = require("../../common/ErrorFormat");
class AbstractBase {
    constructor() {
        this.schema = {};
    }
    register() {
        return [this.uri, this._paramsPares(), this._validate(), this._execute()];
    }
    ;
    /**
     * 参数解析
     *
     * @private
     */
    _paramsPares() {
        return (ctx, next) => __awaiter(this, void 0, void 0, function* () {
            let aggregatedParams = Object.assign({}, ctx.params, ctx.request.query, ctx.request.body);
            // 将数字类型的参数 format 转成
            for (let i of Object.keys(aggregatedParams)) {
                const formatted = Number(aggregatedParams[i]);
                if (_.isNumber(formatted) && !_.isNaN(formatted)) {
                    aggregatedParams[i] = formatted;
                }
            }
            ctx.request.aggregatedParams = aggregatedParams;
            yield next();
        });
    }
    /**
     * 参数验证
     *
     * @private
     */
    _validate() {
        return (ctx, next) => __awaiter(this, void 0, void 0, function* () {
            try {
                // only support joi version less 16
                joi.validate(ctx.request.aggregatedParams, joi.object().keys(this.schema), (e) => {
                    if (e) {
                        throw new ErrorFormat_1.ErrorFormat(10002, e.message);
                    }
                });
                yield next();
            }
            catch (e) {
                ctx.body = this.handleError(e);
            }
        });
    }
    /**
     * 代码执行
     *
     * @private
     */
    _execute() {
        return (ctx, next) => __awaiter(this, void 0, void 0, function* () {
            try {
                ctx.body = this.handleResponse(yield this.handle(ctx, ctx.request, next));
                yield next();
            }
            catch (e) {
                ctx.body = this.handleError(e);
            }
        });
    }
    /**
     * 构建返回数据
     *
     * @param payload
     */
    handleResponse(payload) {
        return {
            code: 0,
            payload: payload
        };
    }
    handleError(e) {
        // CommonTools.logger(e, CommonTools.LOGGER_TYPE_ERROR);
        // 默认报错
        let response = {
            code: 10001
        };
        // 根据报错类型处理报错信息
        if (e instanceof ErrorFormat_1.ErrorFormat) {
            // 抛出 ErrorFormat 报错
            response.code = e.code;
            response.msg = e.message;
        }
        else if (typeof e === 'number') {
            // 抛出 ErrorCode 报错
            response.code = e;
        }
        else if (e instanceof Error) {
            // 抛出未被定义的报错
            response.msg = e.message;
        }
        else {
            // 抛出未知错误
            response.msg = e;
        }
        // 删除空报错信息
        if (response.msg == '%s' || response.msg == '') {
            delete response.msg;
        }
        return response;
    }
}
exports.AbstractBase = AbstractBase;
