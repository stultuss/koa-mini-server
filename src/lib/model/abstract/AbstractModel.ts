import {ObjectType} from 'typeorm';
import {BaseOrmEntity} from '../../orm/abstract/BaseOrmEntity';
import {EntityVo, EntityVoList, OrmFactory} from '../../orm/OrmFactory.class';

export abstract class AbstractModel<T extends BaseOrmEntity> {

    /**
     * 保存 ModelCache，Key 是 EntityClassName，Value 保存的是 EntityVo 或者 EntityVoList
     */
    protected _cache: Map<string, EntityVo<T> | EntityVoList<T>>;
    protected _target: ObjectType<T>;

    public abstract create(data?: Object): EntityVo<T>;

    public abstract get(): Promise<EntityVo<T> | EntityVoList<T>>;

    public abstract set(value: EntityVo<T> | EntityVoList<T>): Promise<EntityVo<T> | EntityVoList<T>>;

    protected constructor(entity: ObjectType<T>) {
        this._cache = new Map<string, any>();
        this._target = entity;
    }

    /**
     * 通过 Entity 保存 Entity Value
     *
     * @param {EntityVo<T extends BaseEntity> | EntityVoList<T extends BaseEntity>} value
     * @private
     */
    protected _saveCache(value: EntityVo<T> | EntityVoList<T> = null) {
        this._cache.set(this._target.name, value);
    }

    /**
     * 通过 Entity 获取 Entity Value
     *
     * @return {EntityVo<T extends BaseEntity> | EntityVoList<T extends BaseEntity>}
     * @private
     */
    protected _loadCache(): EntityVo<T> | EntityVoList<T> {
        return this._cache.get(this._target.name);
    }

    /**
     * 通过 Entity 判断 Entity Value 是否存在
     *
     * @return {boolean}
     * @private
     */
    protected _hasCache(): boolean {
        return this._cache.has(this._target.name);
    }

    /**
     * 获取数据，Model 智能判断是 Entity 还是 EntityList（通过shardValue获取分片的整体数据）
     *
     * @param {string | number} shardValue
     * @param {boolean} isList
     * @return {Promise<R>}
     * @private
     */
    protected async _get<R extends EntityVo<T> | EntityVoList<T>>(shardValue: string | number, isList: boolean = false): Promise<R> {
        // 先从系统缓存中获取数据
        if (this._hasCache()) {
            return this._loadCache() as R;
        }

        // 从 mysql 和 redis 中获取 Entity / EntityList
        const entity = (isList)
            ? await OrmFactory.getVoList(this._target, shardValue)
            : await OrmFactory.getVo(this._target, shardValue);

        // 不管是否存在返回数据，都需要存到系统缓存中，否则每次 get 无数据的行，都会去请求 redis 和 mysql
        this._saveCache(entity);

        return entity as R;
    }

    /**
     * 获取数据, 通过 shardValue 和 indexValue 获取指定的 Entity
     *
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @private
     */
    protected async _find<R extends EntityVo<T> | EntityVoList<T>>(shardValue: string | number, indexValue: string | number): Promise<R> {
        // 先从系统缓存中获取数据(单独设置键）
        const cache = this._loadCache() || {};
        if (cache[indexValue]) {
            return cache[indexValue] as R;
        }

        // 从 mysql 和 redis 中获取 Entity
        const entity = await OrmFactory.findVo(this._target, shardValue, indexValue);

        // 防止出现假的 indexValue 填充到缓存中
        if (entity) {
            cache[indexValue] = entity;
            this._saveCache(cache);
        }

        return entity as R;
    }

    /**
     * 保存数据
     *
     * @param shardValue
     * @param indexValue
     * @param vo
     */
    protected async _save<R extends EntityVoList<T>>(shardValue: string | number, indexValue: string | number, vo: EntityVo<T>): Promise<R> {
        const list = await this._get(shardValue, true) as EntityVoList<T>;
        if (vo == null || list == null) {
            return list as R;
        }

        // indexValue 为空，表示新增数据
        if (!indexValue) {
            await vo.insert();
        } else {
            await vo.save();
        }

        list[indexValue] = vo;
        this._saveCache(list);
        return this._get(shardValue, true);
    }

    /**
     * 删除数据
     *
     * @param shardValue
     * @param indexValue
     */
    protected async _remove<R extends EntityVoList<T>>(shardValue: string | number, indexValue: string | number): Promise<R> {
        const list = await this._get(shardValue, true) as EntityVoList<T>;
        if (indexValue == null || list == null || list[indexValue] == null) {
            return list as R;
        }
        await list[indexValue].remove();
        delete list[indexValue];
        this._saveCache(list);
        return this._get(shardValue, true);
    }
}
