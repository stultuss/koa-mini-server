const debug = require('debug')('[Fatal]:');

export class ErrorHandle {
    private static _instance: ErrorHandle;

    /**
     * 错误捕获功能初始化
     */
    public static init() {
        this._instance = new ErrorHandle();

        ErrorHandle._registerExceptionHandler();
        ErrorHandle._registerRejectionHandler();
    }

    /**
     * 异常捕获
     */
    private static _registerExceptionHandler() {
        process.on('uncaughtException', (e: Error) => {
            debug(`uncaughtException: ${e}`);
        });
    }

    /**
     * 异步的异常捕获
     */
    private static _registerRejectionHandler() {
        process.on('unhandledRejection', (r: any) => {
            debug(`unhandledRejection reason: ${r}`);
            return Promise.reject(r);
        });
    }
}
