import * as LibPath from 'path';
import {ConnectionOptions} from 'typeorm';
import {serverConfig} from './server.config';

export const dbConfig: Array<ConnectionOptions> =
    (process.env.PROJECT_ENV == 'development')
        ? [{
            name: serverConfig.name,
            type: 'mysql',
            host: 'localhost',
            port: 3306,
            username: 'root',
            password: 'qx#Xim!0Euhwc',
            database: `db_${serverConfig.name}`,
            synchronize: false,
            charset: 'utf8',
            entities: [LibPath.join(__dirname, '..', 'entity/*.js')],
            maxQueryExecutionTime: 1000,
            logging: 'all',
        }]
        : [{
            // mysql -h 10.0.35.3 -u market -pQugzTAMKBlVS9ZLt
            name: serverConfig.name,
            type: 'mysql',
            host: '127.0.0.1',
            port: 3306,
            username: 'root',
            password: 'qx#Xim!0Euhwc',
            database:`db_${serverConfig.name}`,
            synchronize: false,
            charset: 'utf8',
            entities: [LibPath.join(__dirname, '..', 'entity/*.js')],
            maxQueryExecutionTime: 1000,
            logging: false
        }];