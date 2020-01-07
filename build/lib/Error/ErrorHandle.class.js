"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const debug = require('debug')('[Fatal]:');
class ErrorHandle {
    /**
     * 错误捕获功能初始化
     */
    static init() {
        this._instance = new ErrorHandle();
        ErrorHandle._registerExceptionHandler();
        ErrorHandle._registerRejectionHandler();
    }
    /**
     * 异常捕获
     */
    static _registerExceptionHandler() {
        process.on('uncaughtException', (e) => {
            debug(`uncaughtException: ${e}`);
        });
    }
    /**
     * 异步的异常捕获
     */
    static _registerRejectionHandler() {
        process.on('unhandledRejection', (r) => {
            debug(`unhandledRejection reason: ${r}`);
            return Promise.reject(r);
        });
    }
}
exports.ErrorHandle = ErrorHandle;
