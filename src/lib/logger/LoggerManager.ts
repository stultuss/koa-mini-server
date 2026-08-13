import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import {loggerConfig} from '../../config/logger.config';

export interface ILoggerConfig {
    level: string,
    dir: string,
}

// 日志消息接口
interface LogMessage {
    level: string;
    timestamp: string;
    message: any;
    metadata?: Record<string, any>;
}

// 日志配置
interface LoggerOptions {
    level: string;
    dir: string;
    maxFiles: string;
    datePattern: string;
}

// 日志类型枚举
export const enum LoggerLevels {
    error = 'error',
    warn = 'warn',
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
        // 避免重复初始化
        if (this._initialized) {
            return;
        }
        this._logger = winston.createLogger({
            level: loggerConfig.level,
            format: this.createLogFormat(),
            transports: this.createTransports()
        });
        this._initialized = true;
    }

    private createLogFormat(): winston.Logform.Format {
        return winston.format.combine(
            winston.format.errors({stack: true}),
            winston.format.json(),
            winston.format.printf(this.formatLogMessage)
        );
    }

    private formatLogMessage(info: any): string {
        // 输出格式
        // TODO message 字段是 Symbol 对象，对于 error 级的日志，需要遍历 message 的 Symbol 拿到 error 对象
        const message: LogMessage = {
            level: info.level,
            timestamp: info.timestamp,
            message: info.message
        };

        if (info.metadata) {
            message.metadata = info.metadata;
        }

        return JSON.stringify(message);
    }

    private createTransports(): winston.transport[] {
        return [
            // Error 日志
            new DailyRotateFile({
                level: LoggerLevels.error,
                filename: `${loggerConfig.dir}/%DATE%_error.log`,
                datePattern: 'YYYY-MM-DD',
                json: false,
                maxFiles: '3d',
                format: winston.format.combine(
                    winston.format.errors({stack: true})
                ),
            }),

            // 常规日志
            new DailyRotateFile({
                filename: `${loggerConfig.dir}/%DATE%_combined.log`,
                datePattern: 'YYYY-MM-DD',
                json: false,
                maxFiles: '7d',
            }),

            // 开发环境控制台输出
            // ...(process.env.NODE_ENV === 'development' ? [
            //     new winston.transports.Console({
            //         format: winston.format.combine(
            //             winston.format.colorize(),
            //             winston.format.simple()
            //         )
            //     })
            // ] : [])
        ];
    }

    public error(...params: any[]): void {
        this.doLog(LoggerLevels.error, arguments);
    }

    public warn(...params: any[]): void {
        this.doLog(LoggerLevels.warn, arguments);
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
        // 处理打印的日志
        const args = [...parentArgs]
        for (const key of Object.keys(args)) {
            if (typeof args[key] === 'string' || typeof args[key] === 'number') {
                continue;
            }
            args[key] = JSON.stringify(args[key]);
        }
        console.log(`[${level.toUpperCase()}]`, ...args);
        (this._logger as any)[level].apply(this._logger, Array.prototype.slice.call(parentArgs));
    }
}
