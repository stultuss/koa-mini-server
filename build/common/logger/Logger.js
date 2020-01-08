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
const path = require("path");
const winston = require("winston");
const logger_1 = require("../../config/logger");
// 所有运行日志
const APP_LOG_NAME = `${logger_1.loggerConfig.dir}/combined.log`;
// 错误信息日志
const ERROR_LOG_NAME = `${logger_1.loggerConfig.dir}/error.log`;
/**
 * 日志单例
 */
class Logger {
    constructor() {
        this._initialized = false;
    }
    static instance() {
        if (Logger._instance === undefined) {
            Logger._instance = new Logger();
        }
        return Logger._instance;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger = winston.createLogger({
                level: "debug" /* debug */,
                format: winston.format.combine(winston.format.json(), winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.printf(info => {
                    // 输出格式
                    // TODO message 字段是 Symbol 对象，对于 error 级的日志，需要遍历 message 的 Symbol 拿到 error 对象
                    return JSON.stringify({
                        time: info.timestamp,
                        pid: process.pid,
                        level: info.level,
                        message: info.message
                    });
                })),
                transports: [
                    // 错误级别的日志处理
                    new winston.transports.File({ level: "error" /* error */, filename: path.resolve(ERROR_LOG_NAME) }),
                    // 所有的日志处理
                    new winston.transports.File({ filename: APP_LOG_NAME, zippedArchive: true }),
                    // 控制台输出
                    new winston.transports.Console()
                ]
            });
            this._initialized = true;
        });
    }
    error(...params) {
        this.doLog("error" /* error */, arguments);
    }
    warn(...params) {
        this.doLog("warn" /* warn */, arguments);
    }
    notice(...params) {
        this.doLog("notice" /* notice */, arguments);
    }
    info(...params) {
        this.doLog("info" /* info */, arguments);
    }
    debug(...params) {
        this.doLog("debug" /* debug */, arguments);
    }
    doLog(level, parentArgs) {
        if (!this._initialized || !this._logger[level]) {
            return; // no instance to log
        }
        this._logger[level].apply(this._logger, Array.prototype.slice.call(parentArgs));
    }
}
exports.default = Logger;
