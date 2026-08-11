import {LoggerManager} from './logger/LoggerManager';

export class Logger {
    private static readonly manager = LoggerManager.instance();

    static error(...args: any[]) {
        return this.manager.error(...args);
    }

    static warn(...args: any[]) {
        return this.manager.warn(...args);
    }

    static info(...args: any[]) {
        return this.manager.info(...args);
    }

    static debug(...args: any[]) {
        return this.manager.debug(...args);
    }
}