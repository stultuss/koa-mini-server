import * as path from 'path';
import {DataSourceOptions} from 'typeorm';

export const dbConfig: { [key: string]: Array<DataSourceOptions> } = {
    demo: [{
        type: 'mysql',
        connectorPackage: 'mysql2',
        driver: require('mysql2'),
        host: process.env.DB_CONFIG_HOST || '127.0.0.1',
        port: Number(process.env.DB_CONFIG_PORT) || 3306,
        username: process.env.DB_CONFIG_USERNAME || 'root',
        password: process.env.DB_CONFIG_PASSWORD || 'qx#Xim!0Euhwc',
        database: 'db_demo_0',
        synchronize: false,
        charset: 'utf8',
        entities: [path.join(__dirname, '..', 'entity/*.js')],
        maxQueryExecutionTime: 1000,
        logging: true
    },{
        type: 'mysql',
        connectorPackage: 'mysql2',
        driver: require('mysql2'),
        host: process.env.DB_CONFIG_HOST || '127.0.0.1',
        port: Number(process.env.DB_CONFIG_PORT) || 3306,
        username: process.env.DB_CONFIG_USERNAME || 'root',
        password: process.env.DB_CONFIG_PASSWORD || 'qx#Xim!0Euhwc',
        database: 'db_demo_1',
        synchronize: false,
        charset: 'utf8',
        entities: [path.join(__dirname, '..', 'entity/*.js')],
        maxQueryExecutionTime: 1000,
        logging: true
    }],
    read_demo: [{
        type: 'mysql',
        connectorPackage: 'mysql2',
        driver: require('mysql2'),
        host: process.env.DB_CONFIG_HOST || '127.0.0.1',
        port: Number(process.env.DB_CONFIG_PORT) || 3306,
        username: process.env.DB_CONFIG_USERNAME || 'root',
        password: process.env.DB_CONFIG_PASSWORD || 'qx#Xim!0Euhwc',
        database: 'db_demo_0',
        synchronize: false,
        charset: 'utf8',
        maxQueryExecutionTime: 1000,
        logging: true
    },{
        type: 'mysql',
        connectorPackage: 'mysql2',
        driver: require('mysql2'),
        host: process.env.DB_CONFIG_HOST || '127.0.0.1',
        port: Number(process.env.DB_CONFIG_PORT) || 3306,
        username: process.env.DB_CONFIG_USERNAME || 'root',
        password: process.env.DB_CONFIG_PASSWORD || 'qx#Xim!0Euhwc',
        database: 'db_demo_1',
        synchronize: false,
        charset: 'utf8',
        maxQueryExecutionTime: 1000,
        logging: true
    }]
}
