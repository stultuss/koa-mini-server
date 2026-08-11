import qs from 'qs';
import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {CryptoTools} from './CryptoTools';
import {RandomTools} from './RandomTools';
import {JsonTools} from './JsonTools';
import {Logger} from '../Logger';
import {Utils} from '../Utils';

const MIN_REQUEST_DELAY = 500;
const MAX_REQUEST_DELAY = 7000;
const MAX_RECONNECT_COUNT = 3; // normal connect count:1, reconnect count:3, total count: 1 + 3

export class RequestTools {
    /**
     * 生成签名
     *
     * @param {Record<string, any>} query
     * @param {string} secret
     * @param {string} ignore
     * @return {Record<string, any>}
     * @private
     */
    public static addSignature(
        query: Record<string, any>,
        secret: string = '',
        ignore: string[] = [],
    ): Record<string, any> {
        let queryStr = '';
        let i = 0;
        for (const key of Object.keys(query).sort()) {
            if (query[key] === '' || query[key] === undefined || query[key] === null) {
                delete query[key];
                continue;
            }
            if (ignore.indexOf(key) !== -1) {
                continue;
            }
            if (i !== 0) {
                queryStr += '&';
            }
            queryStr += `${key}=${query[key]}`;
            i++;
        }
        query.signature = CryptoTools.md5(queryStr + `&${secret}`);

        Logger.info(`[SIGN] signature: ${query.signature} queryStr: ${queryStr}&${secret}`);

        return query;
    }

    /**
     * 封装网络请求
     *
     * @param {'get' | 'post'} method
     * @param {string} url
     * @param {any} data
     * @param {number} timeout
     * @param {string} dataType
     * @param {AxiosRequestConfig} coreOptions
     * @return {Promise<any>}
     */
    public static async query(
        method: 'get' | 'post',
        url: string,
        data?: any,
        dataType: 'json' | 'form' | 'form-data' = 'form',
        timeout: number = 3000,
        coreOptions?: AxiosRequestConfig,
    ): Promise<any> {
        Logger.debug(`[HTTP:REQ] URL: ${url}, Method: ${method}, Options: ${JsonTools.stringify(coreOptions)}, Params:${JsonTools.stringify(data)}`);

        // 组合外部传入的 options 和默认 options
        const options: AxiosRequestConfig = {
            ...coreOptions,
            method,
            url,
            timeout,
            headers: {
                ...coreOptions?.headers,
                'Content-Type': 'application/json'
            }
        };

        // 清理空值参数，并根据 request method 类型给 post data 和 get params 分别赋值
        if (!Utils.isEmptyValue(data)) {
            for (const key of Object.keys(data)) {
                if (data[key] == null) {
                    delete data[key];
                }
            }

            if (method == 'post') {
                switch (dataType) {
                    case 'json': // application/json
                        options.data = data;
                        options.headers['Content-Type'] = 'application/json';
                        break;
                    case 'form': // x-www-form-urlencoded
                        options.data = qs.stringify(data);
                        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        break;
                    case 'form-data': // form-data
                        // FormData 会自动设置正确的 Content-Type，所以这里不需要手动设置
                        if (!(data instanceof FormData)) {
                            options.data = new FormData();
                            Object.entries(data).forEach(([key, value]) => {
                                options.data.append(key, value as string | Blob);
                            });
                        } else {
                            options.data = data;
                        }
                        break;
                }
            } else {
                // 处理数组和对象
                const processedData = {...data};
                for (const [k, v] of Object.entries(processedData)) {
                    // 跳过 null 和 Date 类型
                    if (v === null || v instanceof Date) {
                        continue;
                    }
                    // 只处理普通对象和数组
                    if (Array.isArray(v) || (v && typeof v === 'object' && v.constructor === Object)) {
                        processedData[k] = JSON.stringify(v);
                    }
                }
                options.params = processedData;
            }
        }

        try {
            const response = await this.makeRequest(options);
            return response.data;
        } catch (e) {
            Logger.warn(`[HTTP:ERR] Request failed: ${e.message}`);
            throw e;
        }
    }

    /**
     * 处理 RequestTools 请求，由于三方 API 的返回结构中可能带有报错，所以需要将 RequestTools 返回数据透传到方法外，由封装三方 API 的 class 单独处理
     *
     * @param {AxiosRequestConfig} options
     * @param {number} reconnectCount
     * @return {Promise<AxiosResponse>}
     */
    public static async makeRequest(options: AxiosRequestConfig, reconnectCount: number = 1): Promise<AxiosResponse> {
        try {
            return await RequestTools.Retry(() => axios(options)
                .then((response) => {
                    Logger.debug(`[HTTP:RES] URL: ${options.url}, Method: ${options.method}, Params: ${JsonTools.stringify(options.data || options.params)}, Header: ${JsonTools.stringify(options.headers)}, Response:${JsonTools.stringify(response.data)}`);
                    return response;
                }).catch((e) => {
                    throw e;
                }))
        } catch (e) {
            // 如果状态码小于300,返回包含状态码的成功响应
            if (e.response && e.response.status < 300) {
                return {
                    data: {code: 0, statusCode: e.response.status},
                    status: e.response.status,
                    statusText: e.response.statusText,
                    headers: e.response.headers,
                    config: e.response.config
                };
            }

            // 如果是 429 错误且重试次数未超过限制,延迟后重试
            if (e.response && (e.response.status === 429 || e.response.status === 500) && reconnectCount <= MAX_RECONNECT_COUNT) {
                Logger.debug(`[HTTP:RECONNECT] Body: ${JsonTools.stringify(e.response?.data || e.message)}`);
                const delay = RandomTools.getRandomFromRange(MIN_REQUEST_DELAY, MAX_REQUEST_DELAY);
                await Utils.sleep(delay);
                return this.makeRequest(options, reconnectCount + 1);
            }

            Logger.warn(`[HTTP:ERR] URL: ${options.url}, Method: ${options.method}, Params: ${JsonTools.stringify(options.data || options.params)}, Header: ${JsonTools.stringify(options.headers)}, Body: ${JsonTools.stringify(e.response?.data || e.message)}, ErrorCode: ${e.response?.status}`);
            throw e;
        }
    }

    /**
     * 重试机制
     *
     * @param {Function} fn
     * @param {number} tryCount
     * @return {Record<string, any>}
     */
    public static async Retry(fn: Function, tryCount: number = 3): Promise<any> {
        try {
            return await fn();
        } catch (e) {
            // 网络错误，重试
            if (tryCount == 0) throw e;
            return await RequestTools.Retry(fn, tryCount - 1);
        }
    }
}
