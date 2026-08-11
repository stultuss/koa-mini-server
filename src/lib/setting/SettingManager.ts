import * as path from 'path';
import {FileTools} from '../tools/FileTools';
import {Utils} from '../Utils';
import {Logger} from '../Logger';
import {TimeTools} from '../tools/TimeTools';
import {JsonTools} from '../tools/JsonTools';
import {ErrorMessage} from '../exception/ErrorMessage';

export class SettingManager {
    private static _instance: SettingManager;
    private _initialized: boolean;
    private _settings: Map<string, Object>;
    private _time: Map<string, number>;
    private _lastUpdateTime: number;

    private constructor() {
        this._initialized = false;
        this._settings = new Map<string, Object>();
        this._time = new Map<string, number>();
        this._lastUpdateTime = 0;
    }

    public static instance(): SettingManager {
        if (SettingManager._instance == undefined) {
            SettingManager._instance = new SettingManager();
        }
        return SettingManager._instance;
    }

    /**
     * Initialize ConfigManager.
     *
     * @param  {string} dir
     * @return void
     */
    public async init(dir: string) {
        // 避免重复初始化
        if (this._initialized) {
            return;
        }

        // 读取文件夹文件
        const filePaths = await FileTools.listFiles(dir, [(filePath) => {
            // 当目标是文件夹或者文件后缀是 ".json" 时，不需要被过滤
            const parsedPath = path.parse(filePath);
            return !(parsedPath.ext == '.json' || parsedPath.ext == '');
        }]);

        // 读取配置表
        filePaths.forEach((filePath) => {
            // 不处理非 .json 文件
            const info = path.parse(filePath);
            if (info.ext !== '.json') {
                return;
            }

            try {
                // 引入配置
                const setting = require(filePath);

                // 防止对象被篡改
                Utils.deepFreeze(setting);

                // 保存配置
                this._settings.set(info.name, setting);
                this._time.set(info.name, 0);
            } catch (e) {
                throw new ErrorMessage(10000, 'Config file can not load, file: ' + filePath + ', msg: ' + e.message);
            }
        });

        this._initialized = true;
    }

    /**
     * 读取配置
     *
     * @param {string} configName
     * @param {string | number} key
     * @param {boolean} errNotFound
     * @return {any}
     */
    public get(configName: string, key?: string | number, errNotFound: boolean = true): any {
        if (!this._initialized) {
            throw new ErrorMessage(10000, 'SettingManager not initialized yet');
        }

        const config = this._settings.get(configName);
        if (config) {
            if (key == undefined) {
                return config;
            } else {
                if (config.hasOwnProperty(String(key))) {
                    return config[key];
                }
            }
        }

        if (errNotFound) {
            if (!key && key !== 0) {
                throw new ErrorMessage(10011, configName);
            } else {
                throw new ErrorMessage(10012, configName, key);
            }
        } else {
            return null;
        }
    }

    /**
     * 从配置服务中同步配置
     *
     * @param {(lastUpdateTime: number) => Promise<string>} grpc_config_watch_func grpc watch function
     * @returns {Promise<void>} 返回一个 Promise，表示异步操作完成
     */
    public async sync(grpc_config_watch_func?: (lastUpdateTime: number) => Promise<string>): Promise<void> {
        // 检查是否需要启动同步配置，当没有 config 服务的 watch 方法时，不需要启动
        if (!grpc_config_watch_func) return;

        try {
            // 调用 config watch 服务获取配置
            const response = await grpc_config_watch_func(this._lastUpdateTime);
            const configs = JsonTools.parse(response);
            const config_names = Object.keys(configs);

            if (!config_names?.length && config_names.length === 0) {
                return;
            }

            console.log('-------------------------CONFIG SYNC-------------------------');
            console.log(JsonTools.stringify(config_names));
            console.log('-------------------------------------------------------------');

            // 变更最后更新时间
            this._lastUpdateTime = TimeTools.getTime();

            // 遍历所有配置
            for (const name of config_names) {
                const data = configs[name];
                // 如果配置时间未更新，跳过
                if ((this._time.get(name) || 0) >= data.time) {
                    continue;
                }

                // 配置合并
                const oldSetting = this._settings.get(name);
                // 深拷贝旧配置，避免合并时修改已被 deepFreeze 冻结的嵌套对象
                const oldSettingCopy = oldSetting ? JsonTools.parse(JsonTools.stringify(oldSetting)) : {};
                const newSetting = Utils.deepMerge(oldSettingCopy, data.value);

                // 防止对象被篡改
                Utils.deepFreeze(newSetting);

                // 保存配置
                this._settings.set(name, newSetting);
                this._time.set(name, data.time);
            }
        } catch (e) {
            Logger.warn(e.message);
        }
    }

    /**
     * Sync 的静态方法，（防止 this 指向错误），请勿删除和修改
     *
     * @param args
     */
    public static async taskRunner(...args: any[]) {
        await SettingManager.instance().sync(...args);
    }
}
