import * as _ from 'underscore';
import * as http from 'http';
import * as qs from 'querystring';
import * as util from 'util';
import * as request from 'request';
import * as os from 'os';
import {spawn} from 'child_process';
import {ParsedUrlQueryInput} from 'querystring';
import {LoggerManager} from './logger/LoggerManager';
import {ErrorFormat} from './exception/ErrorFormat';

const MIN_REQUEST_DELAY = 500;
const MAX_REQUEST_DELAY = 7000;
const MAX_RECONNECT_COUNT = 3; // normal connect count:1, reconnect count:3, total count: 1 + 3

/**
 * 通用工具库
 */
export namespace CommonTools {
    
    export const LOGGER_TYPE_INFO = 0;
    export const LOGGER_TYPE_DEBUG = 1;
    export const LOGGER_TYPE_WARN = 2;
    export const LOGGER_TYPE_ERROR = 3;
    
    /**
     * 记录日志
     */
    export function logger(text: any, level: number = LOGGER_TYPE_INFO, isShow: boolean = false) {
        // 是否打印日志
        if (process.env.PROJECT_ENV == 'development' || isShow === true) {
            console.log(text);
        }

        switch (level) {
            case LOGGER_TYPE_INFO:
                LoggerManager.instance().info(text);
                break;
            case LOGGER_TYPE_DEBUG:
                LoggerManager.instance().debug(text);
                break;
            case LOGGER_TYPE_WARN:
                LoggerManager.instance().warn(text);
                break;
            case LOGGER_TYPE_ERROR:
                LoggerManager.instance().error(text);
                break;
            default:
                LoggerManager.instance().info(text);
                break;
        }
    }
    
    /**
     * 随机字符串
     * @return {string}
     */
    export function randStr(lenght: number = 4) {
        let p = 'ABCDEFGHKMNPQRSTUVWXYZ3456789';
        let str = '';
        for (let i = 0; i < lenght; i++) {
            str += p.charAt(Math.random() * p.length | 0);
        }
        return str;
    }
    
    /**
     * 获取 IP
     *
     * @param {module:http.ClientRequest} req
     */
    export function getIP(req: http.ClientRequest) {
        
        if (req && typeof ((req as any).headers['x-forwarded-for']) != 'undefined') {
            let forwardedIpsStr = (req as any).headers['x-forwarded-for'];
            let forwardedIps = forwardedIpsStr.split(',');
            return forwardedIps[0];
        }
        
        let ipAddress;
        if (req) {
            if (req.connection && req.connection.remoteAddress) {
                ipAddress = req.connection.remoteAddress;
            }
            
            if (!ipAddress && req.socket && req.socket.remoteAddress) {
                ipAddress = req.socket.remoteAddress;
            }
            
            if (!ipAddress && req.connection
                && (req.connection as any).socket
                && (req.connection as any).socket.remoteAddress) {
                ipAddress = (req.connection as any).socket.remoteAddress;
            }
        }
        
        return ipAddress;
    }
    
    /**
     * 数字区间
     *
     * @param {number} start
     * @param {number} end
     * @param {number} interval
     * @return {number[]}
     */
    export function range(start: number, end: number, interval: number = 1) {
        const list = [];
        for (let i = start; i <= end; i += interval) {
            list.push(i);
        }
        return list;
    }
    
    /**
     * 填充 string
     *
     * @param {number} num
     * @param {number} length
     * @param {string} context
     * @return {string}
     */
    export function padding(num: number, length: number, context: string = '0') {
        let numLength = (num.toString()).length;
        let paddingLen = (length > numLength) ? length - numLength + 1 || 0 : 0;
        return Array(paddingLen).join(context) + num;
    }
    
    /**
     * Refresh regularly generated resource according to now time & last time resource charged time.
     *
     * @param {number} resource
     * @param {number} lastChargedTime
     * @param {number} limit
     * @param {number} recoveryInterval
     * @param {number} recoveryAmount
     * @param {number} reqTime
     * @return any
     */
    export function refreshResource(resource: number, lastChargedTime: number, limit: number, recoveryInterval: number, recoveryAmount: number, reqTime: number): [number, number] {
        // prepare params
        const recoveryTimes = Math.floor((reqTime - lastChargedTime) / recoveryInterval);
        if (recoveryTimes) { // resource recovery time reached, go through following logics
            if (resource < limit) { // if resource is smaller than limit, means resource can recover
                resource += recoveryTimes * recoveryAmount;
                if (resource > limit) { // resource recovery exceeded the limit, change it to limit
                    resource = limit;
                }
            }
            // if resource recovered, time need to be set to now
            lastChargedTime += recoveryTimes * recoveryInterval;
        }
        
        return [resource, lastChargedTime];
    }
    
    /**
     * util.format()
     */
    export const format = util.format;
    
    /**
     * 将 callback 的方法转成 promise 方法
     *
     * @param {Function} fn
     * @param {any} receiver
     * @return {Function}
     */
    export function promisify(fn: Function, receiver: any): (...args) => Promise<any> {
        return (...args) => {
            return new Promise((resolve, reject) => {
                fn.apply(receiver, [...args, (err, res) => {
                    return err ? reject(err) : resolve(res);
                }]);
            });
        };
    }
    
    /**
     * 完全冻结对象中的所有对象
     *
     * @param {Object} obj
     */
    export function deepFreeze(obj: Object) {
        Object.freeze(obj);
        let keys = Object.keys(obj);
        for (let i of keys) {
            let v = obj[keys[i]];
            if (typeof v !== 'object' || Object.isFrozen(v)) {
                continue;
            }
            deepFreeze(v);
        }
    }
}

/**
 * 时间函数工具库
 */
export namespace TimeTools {
    
    export const EMPTY_TIME = '0000-00-00 00:00:00'; // default value in DB
    export const TIMESTAMP_INIT_TIME = '1970-01-01 00:00:00';
    
    // time constants, all in seconds
    export const MINUTE = 60;
    export const MINUTES5 = 300;
    export const MINUTES10 = 600;
    export const MINUTES30 = 1800;
    export const HOUR = 3600;
    export const HOURS4 = 14400;
    export const HOURS6 = 21600;
    export const HOURS8 = 28800;
    export const HOURS12 = 43200;
    export const HOURS24 = 86400;
    export const DAY2 = 172800;
    export const DAY3 = 259200;
    export const DAY7 = 604800;
    export const DEFAULT_EMPTY_TIME = 1514736000;
    
    /**
     * 获取 Date 对象
     *
     * @return {Date}
     */
    export function getDate(timestamp?: number): Date {
        if (timestamp === 0) {
            timestamp = DEFAULT_EMPTY_TIME;
        }
        
        if (timestamp) {
            let millisecond = secondToMilli(timestamp);
            return new Date(millisecond);
        }
        
        return new Date();
    }
    
    /**
     * 获取时间戳
     *
     * @param {number} timestamp
     * @return {number}
     */
    export function getTime(timestamp?: number): number {
        let millisecond = secondToMilli(timestamp);
        return milliToSecond(getDate(millisecond).getTime());
    }
    
    /**
     * 获取时间的当日 0 点
     *
     * @param {number} timestamp
     * @return {number}
     */
    export function getDayTime(timestamp?: number): number {
        let millisecond = secondToMilli(timestamp);
        let date = getDate(millisecond);
        date.setHours(0, 0, 0, 0);
        return milliToSecond(date.getTime());
    }
    
    /**
     * 获取时间的昨日 0 点
     *
     * @param {number} timestamp
     * @return {number}
     */
    export function getPrevDayTime(timestamp?: number): number {
        return getDayTime(timestamp) - HOURS24;
    }
    
    /**
     * 获取时间的明日 0 点
     *
     * @param {number} timestamp
     * @return {number}
     */
    export function getNextDayTime(timestamp?: number): number {
        return getDayTime(timestamp) + HOURS24;
    }
    
    /**
     * 将毫秒转成秒
     *
     * @param {number} timestamp
     * @return {number}
     */
    export function milliToSecond(timestamp: number): number {
        if (!timestamp) {
            return timestamp;
        }
        
        if (timestamp.toString().length < 13) {
            timestamp = secondToMilli(timestamp);
        }
        return Math.floor(timestamp / 1000);
    }
    
    /**
     * 将毫秒转成秒
     *
     * @param {number} timestamp
     * @return {number}
     */
    export function secondToMilli(timestamp: number): number {
        if (!timestamp) {
            return timestamp;
        }
        
        if (timestamp && timestamp.toString().length > 10) {
            timestamp = milliToSecond(timestamp);
        }
        return Math.floor(timestamp * 1000);
    }
    
    /**
     * 获取到达次日 0 点需要多少秒
     *
     * @param {number} timestamp
     * @return {number}
     */
    export function getNextDayRemainSecond(timestamp?: number): number {
        return getDayTime(timestamp) + TimeTools.HOURS24 - ((timestamp) ? timestamp : TimeTools.getTime());
    }
    
    /**
     * 获取当前时间点到目标时间点还需要多少秒
     *
     * @return {number}
     */
    export function getRemainSecond(targetTime: number, beginTime?: number): number {
        const target = milliToSecond(targetTime);
        const begin = beginTime || TimeTools.getTime();
        return (target < begin) ? 0 : target - begin;
    }
    
    /**
     * 计算当前循环轮数
     *
     * @param {number} time
     * @param {number} startTime
     * @param {number} coolDown
     * @return {number}
     */
    export function getCycleRound(time: number, startTime: number, coolDown: number) {
        const curTime = (time) ? getTime() : time;
        return Math.floor((curTime - startTime) / coolDown);
    }
    
    /**
     * 计算当前循环的开始时间
     *
     * @param {number} time
     * @param {number} startTime
     * @param {number} coolDown
     * @return {number}
     */
    export function getCycleRoundTime(time: number, startTime: number, coolDown: number) {
        return startTime + (getCycleRound(time, startTime, coolDown)) * coolDown;
    }
    
    /**
     * 计算下一次循环轮次
     *
     * @param {number} time
     * @param {number} startTime
     * @param {number} coolDown
     * @return {number}
     */
    export function getNextCycleRound(time: number, startTime: number, coolDown: number) {
        return getCycleRound(time, startTime, coolDown) + 1;
    }
    
    /**
     * 计算下一次循环的开始时间
     *
     * @param {number} time
     * @param {number} startTime
     * @param {number} coolDown
     * @return {number}
     */
    export function getNextCycleRoundTime(time: number, startTime: number, coolDown: number) {
        return startTime + (getCycleRound(time, startTime, coolDown) + 1) * coolDown;
    }
}

/**
 * 数学函数工具库
 */
export namespace MathTools {
    /**
     * 乱序
     *
     * @param list
     */
    export function shuffle(list): Array<any> {
        list.sort(() => Math.random() - 0.5);
        return list;
    }
    
    /**
     * Get Random Element From Array. And if probability is 0, then return this bonus id directly without random logic. <br/>
     * Probability logic: The percentage probability means is determined by the total sum value.
     *
     * <pre>
     * e.g the total sum value is 10000
     * bonusId => probability
     * 10      => 500 5%
     * 11      => 500 5%
     * 12      => 500 5%
     * 13      => 400 4%
     * 14      => 50 0.5%
     * 15      => 50 0.5%
     * 16      => 1500 15%
     * 17      => 1500 15%
     * 18      => 5000 50%
     * </pre>
     *
     * @param {Object} probabilityList
     * <pre>
     *     {
     *          bonusId: probability,
     *          ...
     *     }
     * </pre>
     * @return {number}
     */
    export function getRandomElementByProbability(probabilityList: { [bonusId: string]: any } | { [bonusId: number]: any }): any {
        let all = 0;
        let result: string = null;
        let probabilityKeys = Object.keys(probabilityList);
        
        probabilityKeys.forEach((bonusId) => {
            let probability = probabilityList[bonusId];
            // 配置 probability = 0，则代表必中
            if (probability == 0) {
                // result = bonusId;
                // return;
            }
            all += probability;
        });
        
        if (result == null) {
            let seed = getRandomFromRange(0, all);
            let sum = 0;
            probabilityKeys.forEach((bonusId) => {
                if (result != null) {
                    return;
                }
                
                // get bonus id by probability
                sum += probabilityList[bonusId];
                if (seed <= sum) {
                    result = bonusId;
                    return;
                }
            });
        }
        
        return result;
    }
    
    /**
     * 获取随机数，范围 min <= x <= max
     *
     * @param {number} min
     * @param {number} max
     * @return {number}
     */
    export function getRandomFromRange(min: number, max: number): number {
        // min is bigger than max, exchange value
        if (min >= max) {
            min = min ^ max;
            max = min ^ max;
            min = min ^ max;
        }
        
        return Math.round(Math.random() * (max - min) + min);
    }
    
    /**
     * Calculate whether given percentage rate hit or not.
     *
     * @param {number} rate
     * <pre>
     * shall be 1-100
     * if float, it should be 0.xx and will be multiplied by 100 (0.xx * 100 => xx%)
     * </pre>
     * @return {boolean} hit
     */
    export function calcPercentageRate(rate: number): boolean {
        // 浮点数处理
        if (!isNaN(rate) && rate.toString().indexOf('.') != -1) {
            rate = rate * 100; // convert 0.3 => 30%
        }
        
        let hit = false;
        if (rate <= 0) {
            // do nothing, $hit already FALSE
        } else {
            if (rate >= 100) {
                hit = true;
            } else {
                let randomRate = getRandomFromRange(1, 100);
                if (randomRate <= rate) {
                    hit = true;
                }
            }
        }
        
        return hit;
    }
}

/**
 * HTTP Request 工具库
 */
export namespace RequestTools {
    
    export const methods = {
        'post': request.post,
        'get': request.get
    };
    
    export interface IRequest {
        (uri: string, options?: request.CoreOptions, callback?: request.RequestCallback): request.Request;
        
        (uri: string, callback?: request.RequestCallback): request.Request;
        
        (options: request.UriOptions & request.CoreOptions, callback?: request.RequestCallback): request.Request;
    }
    
    /**
     * 封装网络请求
     *
     * @param {"get" | "post"} requestMethod
     * @param {string} url
     * @param {Object} params
     * @param {string} dataType
     * @param {number} timeout
     * @return {Promise<any>}
     */
    export async function httpRequest(requestMethod: 'get' | 'post', url: string, params?: ParsedUrlQueryInput, dataType: string = 'json', timeout: number = 1000): Promise<any> {
        // 组合 request option 配置
        let options: request.CoreOptions = {};
        
        // 如果没有 timeout，则不设置过期时间
        if (timeout) {
            options.timeout = timeout;
        }
        
        // 如果参数不为空，则进行参数拼接
        if (!_.isEmpty(params)) {
            for (let key of Object.keys(params)) {
                if (params[key] == null) {
                    delete params[key];
                }
            }
            
            if (requestMethod == 'post') {
                options.form = params;
            } else {
                url += '?' + qs.stringify(params);
            }
        }
        
        let method = requestMethod.toLowerCase();
        if (!methods[method]) {
            throw new ErrorFormat(700510, method);
        }
        let res = await makeRequest(methods[method], url, options);
        CommonTools.logger(`[HTTP] res: ${res}, url: ${url}, options: ${JSON.stringify(options)}`);
        
        // 当 dataType = json 或者返回结果为空时候，直接透传
        if (res == null || dataType != 'json') {
            return res;
        }
        
        // body 返回的结果为 json 字符串
        return JSON.parse(res.replace('\n', ''));
    }
    
    /**
     * 处理 RequestTools 请求，由于三方 API 的返回结构中可能带有报错，所以需要将 RequestTools 返回数据透传到方法外，由封装三方 API 的 class 单独处理
     *
     * @param {RequestTools.IRequest} fn
     * @param {string} url
     * @param {request.CoreOptions} options
     * @param {number} reconnectCount
     * @return {Promise<string>}
     */
    function makeRequest(fn: IRequest, url: string, options: request.CoreOptions, reconnectCount: number = 1): Promise<string> {
        return new Promise((resolve, reject) => {
            let completeCallback = (err: Error | null, response?: request.Response, body: string = null) => {
                if (err) {
                    reject(err);
                } else if (response && response.statusCode != 200) {
                    if (response.statusCode == 429 && reconnectCount <= MAX_RECONNECT_COUNT) {
                        reconnectCount++;
                        // in case we hit RequestTools 429, delay requests by random timeout in between minRequestDelay and maxRequestDelay
                        setTimeout(() => {
                            fn(url, options, completeCallback);
                        }, MathTools.getRandomFromRange(MIN_REQUEST_DELAY, MAX_REQUEST_DELAY));
                    } else {
                        reject(new Error(`HTTP Status Code: ${response.statusCode}`));
                    }
                } else {
                    resolve(body);
                }
            };
            
            fn(url, options, completeCallback);
        });
    }
}

export namespace JsonTools {
    
    /**
     * 解析 JSON
     *
     * @param {string} str
     * @param {any} defaultValue
     * @return {Object}
     */
    export function parse(str: string, defaultValue: any = {}): any {
        try {
            return JSON.parse(str);
        } catch (e) {
            return defaultValue;
        }
    }
    
    /**
     * 字符串转 json
     *
     * @param {string} str
     * @return {Object}
     */
    export function stringToJson(str: string): Object {
        return JSON.parse(str);
    }
    
    /**
     *json 转字符串
     *
     * @param {Object} obj
     * @return {string}
     */
    export function jsonToString(obj: Object): string {
        return JSON.stringify(obj);
    }
    
    /**
     * map 转换为 json
     *
     * @param {Map<any, any>} map
     * @return {string}
     */
    export function mapToJson(map: Map<any, any>): string {
        return JSON.stringify(JsonTools.mapToObj(map));
    }
    
    /**
     * json 转换为 map
     *
     * @param {string} str
     * @return {Map<any, any>}
     */
    export function jsonToMap(str: string): Map<any, any> {
        return JsonTools.objToMap(JSON.parse(str));
    }
    
    /**
     * map 转化为 obj
     *
     * @param {Map<any, any>} map
     * @return {Object}
     */
    export function mapToObj(map: Map<any, any>): Object {
        let obj = Object.create(null);
        for (let [k, v] of map) {
            obj[k] = v;
        }
        return obj;
    }
    
    /**
     * obj 转换为 map
     *
     * @param {Object} obj
     * @return {Map<any, any>}
     */
    export function objToMap(obj: Object): Map<any, any> {
        let strMap = new Map();
        for (let k of Object.keys(obj)) {
            strMap.set(k, obj[k]);
        }
        return strMap;
    }
}

/**
 * 分库分表工具库
 */
export namespace SharingTools {
    
    /**
     * 通过数量和分片 id 计算分片，如果没有分片 id，则默认为 0 号分片
     *
     * @param {number} count
     * @param {number} shardKey
     * @return {number}
     */
    export function getShardId(count: number, shardKey: number = null) {
        if (count <= 1 || shardKey == null || shardKey <= 0) {
            return 0;
        }
        return shardKey % count;
    }
}

/**
 * 命令行工具库
 */
export namespace ShellTools {
    
    /**
     * 执行 shell
     *
     * @param {string} cmd
     * @param {string[]} args
     * @param {Function} cb
     */
    export function exec(cmd: string, args: string[], cb: (err: Error, stdout?: string, code?: number) => void) {
        let executed = false;
        let stdout = '';
        let stderr = '';
        
        let ch = spawn(cmd, args);
        ch.stdout.on('data', (d) => {
            stdout += d.toString();
        });
        
        ch.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        
        ch.on('error', (err: Error) => {
            if (executed) return;
            // callback
            executed = true;
            cb(err);
        });
        
        ch.on('close', function (code, signal) {
            if (executed) return;
            
            // callback
            executed = true;
            if (stderr) {
                return cb(new Error(stderr));
            }
            
            cb(null, stdout, code);
        });
    }
    
    /**
     * 获取 pid 信息.
     * @param  {Number[]} pids
     * @param  {Function} cb
     */
    export function ps(pids: number[], cb: (err: Error, stat?: any) => void) {
        const pArg = pids.join(',');
        const args = ['-o', 'etime,pid,ppid,pcpu,time', '-p', pArg];
        
        exec('ps', args, (err: Error, stdout: string, code: number) => {
            if (err) return cb(err);
            if (code === 1) {
                return cb(new Error('No maching pid found'));
            }
            if (code !== 0) {
                return cb(new Error('pidusage ps command exited with code ' + code));
            }
            
            let now = new Date().getTime();
            let statistics = {};
            let output = stdout.split(os.EOL);
            for (let i = 1; i < output.length; i++) {
                let line = output[i].trim().split(/\s+/);
                if (!line || line.length !== 5) {
                    continue;
                }
                
                let etime = line[0];
                let pid = parseInt(line[1], 10);
                let ppid = parseInt(line[2], 10);
                let cpu = line[3];
                let ctime = line[4];
                
                statistics[pid] = {
                    pid: pid,
                    ppid: ppid,
                    cpu: cpu,
                    ctime: ctime,
                    elapsed: etime,
                    timestamp: now
                };
            }
            
            cb(null, statistics);
        });
    }
}