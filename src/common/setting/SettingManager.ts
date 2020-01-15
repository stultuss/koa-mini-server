import * as LibPath from 'path';
import {readfiles} from 'iterable-readfiles';
import {CommonTools} from '../Utility';
import {ErrorFormat} from '../exception/ErrorFormat';

export class SettingManager {
  private static _instance: SettingManager;
  private _initialized: boolean;
  private _settings: Map<string, Object>;
  
  private constructor() {
    this._initialized = false;
    this._settings = new Map<string, Object>();
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
        const setting = require(filePath);
        
        // 防止对象被篡改
        CommonTools.deepFreeze(setting);
        
        // 保存配置
        this._settings.set(info.name, setting);
      } catch (e) {
        throw new ErrorFormat(100000, 'Config file can not load, file: ' + filePath + ', msg: ' + e.message);
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
      throw new ErrorFormat(100000, 'SettingManager not initialized yet');
    }
    
    let config = this._settings.get(configName);
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
        throw new ErrorFormat(300001, configName);
      } else {
        throw new ErrorFormat(300002, configName, key);
      }
    } else {
      return null;
    }
  }
}