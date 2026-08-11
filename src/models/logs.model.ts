import {AbstractModel} from '../lib/model/abstract/AbstractModel';
import {EntityVo, EntityVoList, OrmFactory} from '../lib/orm/OrmFactory.class';
import {Logs} from '../entity/Logs';

export type LogsVo = EntityVo<Logs>;
export type LogsVoList = EntityVoList<Logs>;

export class LogsModel extends AbstractModel<Logs> {

  private readonly _pk: string;

  public constructor(pk: string) {
    super(Logs);
    this._pk = pk;
  }

  /**
   * 默认值, 必须每个值都处理到，否则缓存和数据库的字段有差异会导致一些未知问题
   *
   * @return {Object} data
   * @return {LogsVo}
   */
  public defaultData(data: Object = {}): LogsVo {
    const vo = new Logs();
    vo.uid = data['uid'] || this._pk;
    vo.type = data['type'] || 0;
    vo.count = data['count'] || 0;
    vo.remain = data['remain'] || 0;
    vo.memo = data['memo'] || '';
    vo.time = data['time'] || 0;
    return vo;
  }

  public create(data?: Object): LogsVo {
    return OrmFactory.createEntity(this._target, this._pk, this.defaultData(data));
  }

  public async get(): Promise<LogsVoList> {
    return await this._get<LogsVoList>(this._pk, true);
  }

  public async set(value: LogsVoList): Promise<LogsVoList> {
    this._saveCache(value);
    return await this.get();
  }

  public async find(index: number): Promise<LogsVo> {
    return await this._find<LogsVo>(this._pk, index);
  }
}
