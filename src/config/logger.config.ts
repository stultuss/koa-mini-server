import * as LibPath from "path";
import {LoggerLevels} from '../common/logger/LoggerManager';

export interface ILoggerConfig {
    level: string,
    dir: string,
}

export const loggerConfig: ILoggerConfig = {
    level: LoggerLevels.debug,
    dir: LibPath.resolve(__dirname, '..', '..', 'logs'),
};
