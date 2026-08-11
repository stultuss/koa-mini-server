import * as path from 'path';
import {LoggerLevels, ILoggerConfig} from '../lib/logger/LoggerManager';

export const loggerConfig: ILoggerConfig = {
    level: process.env.LOGGER_LEVEL || LoggerLevels.debug,
    dir: path.resolve(__dirname, '..', '..', 'logs')
};
