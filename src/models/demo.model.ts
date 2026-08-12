import {AbstractModel} from '../lib/model/abstract/AbstractModel';
import {EntityVo, OrmFactory} from '../lib/orm/OrmFactory.class';
import {Demo} from '../entity/Demo';

export type DemoVo = EntityVo<Demo>;

export class DemoModel extends AbstractModel<Demo> {

  private readonly _pk: number;
  public isCreate: boolean = false;

  public constructor(pk: number) {
    super(Demo);
    this._pk = pk;
  }
  
  /**
   * 默认值, 必须每个值都处理到，否则缓存和数据库的字段有差异会导致一些未知问题
   *
   * @return {Object} data
   * @return {DemoVo}
   */
  public defaultData(data: Object = {}): DemoVo {
    const vo = new Demo();
    vo.uid = data['uid'] ?? this._pk;
    vo.openId = data['openId'] ?? '';
    vo.name = data['name'] ?? '';
    vo.createTime = data['createTime'] ?? 0;
    vo.loginTime = data['lastLoginTime'] ?? 0;
    vo.status = data['status'] ?? 1;
    return vo;
  }

  public create(data?: Object): DemoVo {
    this.isCreate = true;
    return OrmFactory.createEntity(this._target, this._pk, this.defaultData(data));
  }

  public async get(): Promise<DemoVo> {
    return await this._get<DemoVo>(this._pk);
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

    return {...data,};
  }
}
