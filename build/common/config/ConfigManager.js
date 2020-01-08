"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const LibPath = require("path");
const iterable_readfiles_1 = require("iterable-readfiles");
const Utility_1 = require("../Utility");
const ErrorFormat_1 = require("../exception/ErrorFormat");
class ConfigManager {
    constructor() {
        this._configs = new Map();
    }
    static instance() {
        if (ConfigManager._instance == undefined) {
            ConfigManager._instance = new ConfigManager();
        }
        return ConfigManager._instance;
    }
    /**
     * Initialize ConfigManager.
     *
     * @throws SzException
     * @return void
     */
    init(dir) {
        return __awaiter(this, void 0, void 0, function* () {
            // 读取文件夹文件
            let filePaths = yield iterable_readfiles_1.readfiles(dir, [(filePath) => {
                    // 当目标是文件夹或者文件后缀是 ".json" 时，不需要被过滤
                    const parsedPath = LibPath.parse(filePath);
                    return !(parsedPath.ext == '.json' || parsedPath.ext == '');
                }]);
            // 读取配置表
            filePaths.forEach((filePath) => {
                let info = LibPath.parse(filePath);
                try {
                    // 引入配置
                    const config = require(filePath);
                    // 防止对象被篡改
                    Utility_1.CommonTools.deepFreeze(config);
                    // 保存配置
                    this._configs.set(info.name, config);
                }
                catch (e) {
                    throw new Error('Config file can not load, file: ' + filePath + ', msg:' + e.message);
                }
            });
        });
    }
    /**
     * 读取配置
     *
     * @param {string} configName
     * @param {string | number} key
     * @param {boolean} errNotFound
     * @return {any}
     */
    get(configName, key, errNotFound = true) {
        let config = this._configs.get(configName);
        if (config) {
            if (key == undefined) {
                return config;
            }
            else {
                if (config.hasOwnProperty(key.toString())) {
                    return config[key];
                }
            }
        }
        if (errNotFound) {
            if (!key && key !== 0) {
                throw new ErrorFormat_1.ErrorFormat(30001, configName);
            }
            else {
                throw new ErrorFormat_1.ErrorFormat(30002, configName, key);
            }
        }
        else {
            return null;
        }
    }
}
exports.ConfigManager = ConfigManager;
