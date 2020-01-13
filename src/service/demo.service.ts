import * as _ from 'underscore';
import {ErrorFormat} from '../common/exception/ErrorFormat';
import {CacheFactory} from '../common/cache/CacheFactory.class';
import {TimeTools} from '../common/Utility';
import {DemoModel} from '../models/demo.model';
import {Logs} from '../entity/Logs';


export namespace DemoService {
  /**
   * 获取 DEMO 数据
   *
   * @param {number} uid
   * @return {Promise<DemoModel>}
   */
  export async function getDemo(uid: number): Promise<DemoModel> {
    // 获取当前时间
    let now = TimeTools.getTime();
    
    // 获取 demo 数据
    let demoModel = new DemoModel(uid);
    let demo = await demoModel.get();
    
    if (!demo) {
      demo = demoModel.create();
      demo.name = 'test';
      demo.openId = uid.toString();
      demo.createTime = now;
    }
    
    // 更新登录时间
    demo.loginTime = now;
    
    // 持久化
    await demoModel.set(demo);
    await demoModel.persist();
    
    // 记录日志
    let logs = new Logs();
    logs.uid = uid;
    logs.type = 1;
    logs.memo = (demoModel.isCreate) ? 'create' : 'update';
    logs.time = now;
    await logs.insert();
    
    return demoModel;
  }
}