import * as winston from 'winston';
import {loggerConfig} from '../../config/logger';

// 日志类型枚举
export const enum LoggerLevels {
    error = 'error',
    warn = 'warn',
    notice = 'notice',
    info = 'info',
    debug = 'debug',
}

/**
 * 日志单例
 */
export class LoggerManager {
    private _initialized: boolean;
    private _logger: winston.Logger;
    
    private static _instance: LoggerManager;
    
    private constructor() {
        this._initialized = false;
    }
    
    public static instance(): LoggerManager {
        if (LoggerManager._instance === undefined) {
            LoggerManager._instance = new LoggerManager();
        }
        return LoggerManager._instance;
    }
    
    public async init() {
        this._logger = winston.createLogger({
            level: loggerConfig.level,
            format: winston.format.combine(
                winston.format.json(),
                winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                winston.format.printf(info => {
                    // 输出格式
                    // TODO message 字段是 Symbol 对象，对于 error 级的日志，需要遍历 message 的 Symbol 拿到 error 对象
                    return JSON.stringify({
                        time: info.timestamp,
                        pid: process.pid,
                        level: info.level,
                        message: info.message
                    });
                })
            ),
            transports: [
                // 错误级别的日志处理
                new winston.transports.File({level: LoggerLevels.error, filename: `${loggerConfig.dir}/error.log`}),
                // 所有的日志处理
                new winston.transports.File({filename: `${loggerConfig.dir}/combined.log`}),
                // 控制台输出
                new winston.transports.Console()
            ]
        });
        this._initialized = true;
    }
    
    public error(...params: any[]): void {
        this.doLog(LoggerLevels.error, arguments);
    }
    
    public warn(...params: any[]): void {
        this.doLog(LoggerLevels.warn, arguments);
    }
    
    public notice(...params: any[]): void {
        this.doLog(LoggerLevels.notice, arguments);
    }
    
    public info(...params: any[]): void {
        this.doLog(LoggerLevels.info, arguments);
    }
    
    public debug(...params: any[]): void {
        this.doLog(LoggerLevels.debug, arguments);
    }
    
    public doLog(level: string, parentArgs: any): void {
        if (!this._initialized || !this._logger[level]) {
            return; // no instance to log
        }
        (this._logger as any)[level].apply(this._logger, Array.prototype.slice.call(parentArgs));
    }
}