import {AbstractBaseModel} from './abstract/AbstractBase.model';
import {EntityVo, OrmFactory} from '../common/orm/OrmFactory.class';
import {ErrorFormat} from '../common/exception/ErrorFormat';
import {JsonTools} from '../common/Utility';
import {Demo} from '../entity/Demo';

export type DemoVo = EntityVo<Demo>;

export class DemoModel extends AbstractBaseModel<Demo> {
  
  private readonly _uid: number;
  public isCreate: boolean = false;
  
  public constructor(uid: number) {
    super(Demo);
    this._uid = Number(uid);
  }
  
  /**
   * 默认值, 必须每个值都处理到，否则缓存和数据库的字段有差异会导致一些未知问题
   *
   * @return {Object} data
   * @return {DemoVo}
   */
  public defaultData(data: Object = {}): DemoVo {
    const vo = new Demo();
    vo.uid = this._uid;
    vo.openId = data['openId'] || '';
    vo.name = data['name'] || '';
    vo.createTime = data['createTime'] || 0;
    vo.loginTime = data['lastLoginTime'] || 0;
    vo.status = data['status'] || 1;
    return vo;
  }
  
  public create(data?: Object): DemoVo {
    // 是否创建新对象
    this.isCreate = true;
    return OrmFactory.createEntity(this._target, this._uid, this.defaultData(data));
  }
  
  public async get(): Promise<DemoVo> {
    return await this._get<DemoVo>(this._uid);
  }
  
  public async set(value: DemoVo): Promise<DemoVo> {
    this._saveCache(value);
    return await this.get();
  }
  
  public async format(): Promise<Object> {
    const data = await this.get();
    if (data == null) {
      return null;
    }
    return {
      ...data,
    };
  }
  
  public async simple(): Promise<Object> {
    const data = await this.get();
    if (data == null) {
      return null;
    }
    
    return {
      uid: data.uid,
      name: data.name,
      createTime: data.createTime
    };
  }
}
