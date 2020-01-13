import * as LibPath from 'path';
import {readfiles} from 'iterable-readfiles';
import {CommonTools} from '../Utility';
import {ErrorFormat} from '../exception/ErrorFormat';

export class ConfigManager {
  private _configs: Map<string, Object>;
  
  private static _instance: ConfigManager;
  
  private constructor() {
    this._configs = new Map<string, Object>();
  }
  
  public static instance(): ConfigManager {
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
  public async init(dir: string) {
    // 读取文件夹文件
    let filePaths = await readfiles(dir, [(filePath) => {
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
        CommonTools.deepFreeze(config);
      
        // 保存配置
        this._configs.set(info.name, config);
      } catch (e) {
        throw new ErrorFormat(1, 'Config file can not load, file: ' + filePath + ', msg: ' + e.message);
      }
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
  public get(configName: string, key?: string | number, errNotFound: boolean = true): any {
    let config = this._configs.get(configName);
    if (config) {
      if (key == undefined) {
        return config;
      } else {
        if (config.hasOwnProperty(key.toString())) {
          return config[key];
        }
      }
    }

    if (errNotFound) {
      if (!key && key !== 0) {
        throw new ErrorFormat(30001, configName);
      } else {
        throw new ErrorFormat(30002, configName, key);
      }
    } else {
      return null;
    }
  }
}