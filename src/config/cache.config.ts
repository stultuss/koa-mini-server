import * as redis from 'redis';
import {serverConfig} from './server.config';

export interface IRedisConfig {
    port: number,
    host: string,
    options: {
        connect_timeout: number, // redis 服务断开重连超时时间
        retry_delay: number, // redis 服务断开，每隔多少时间重连
        password?: string,
        retry_strategy?: redis.RetryStrategy,
    }
}

export const cacheType = 'Redis';
export const cacheConfig: Array<IRedisConfig> =
    (serverConfig.env == 'development')
        ? [{
            host: '127.0.0.1',
            port: 6379,
            options: {
                connect_timeout: 36000000,
                retry_delay: 2000
            }
        }]
        : [{
            host: '127.0.0.1',
            port: 6379,
            options: {
                password: 'password',
                connect_timeout: 36000000,
                retry_delay: 2000,
            }
        }];

// 正常删除操作
// redis-cli -h 127.0.0.1 keys "demo:*" | xargs redis-cli -h 127.0.0.1 del

// 集群删除处理
// redis-cli -h 127.0.0.1 cluster nodes
// redis-cli -h 127.0.0.1 keys "demo:*" f0016c286197501b86828ba6678365018c4a1f73
// redis-cli -h 127.0.0.1 keys "demo:*" f0016c286197501b86828ba6678365018c4a1f73 | xargs -i redis-cli -h 127.0.0.1 del {}