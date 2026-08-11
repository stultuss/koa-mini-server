import {BaseEntity, SaveOptions} from 'typeorm';
import {EntityClass, OrmFactory} from '../OrmFactory.class';
import {OrmEntityStorage} from '../OrmEntityStorage';
import {ErrorMessage} from '../../exception/ErrorMessage';
import {Logger} from '../../Logger';

interface SaveOrmOptions extends SaveOptions {
    DoubleDelete?: boolean; // do nothing
}

/**
 * Base abstract entity for get entities, used in ActiveRecord patterns.
 */
export class BaseOrmEntity extends BaseEntity {
    /**
     * 重载 BaseEntity.insert()，增加对缓存的操作
     *
     * @return {Promise<this>}
     */
    public async insert(options?: SaveOrmOptions): Promise<this> {
        const entity = this.constructor as typeof BaseOrmEntity;
        const {ShardColumn, IndexColumn} = OrmEntityStorage.instance.get(entity.name);
        const repository = entity.getRepository();

        try {
            // 数据库操作
            await repository.insert(this);

            // 查询分片字段和索引字段
            const shardValue = this[ShardColumn];
            const indexValue = this[IndexColumn];

            // 仅在有缓存索引的情况下才更新缓存索引，如果缓存索引不存在，等下次数据库查询时更新全量的缓存索引。因为没有索引的情况下插入索引，会导致缓存不一致。
            // 缓存索引不存在的情况：
            //    情况1: 缓存索引到期失效
            //    情况2: 缓存索引被误删除（不考虑手动删除某一条缓存索引的情况）
            if ((await OrmFactory.getVoIndexCache(entity, shardValue)).length > 0) {
                await OrmFactory.setVoListIndexCache(entity, shardValue, String(indexValue));
            }

            return this;
        } catch (e) {
            Logger.warn(`Entity ${entity.name} insert failed:`, {
                error: e,
                entityData: this
            });
            throw new ErrorMessage(10001, `Insert failed for entity ${entity.name}: ${e.message}`);
        }
    }

    /**
     * 重载 BaseEntity.save()，增加对缓存的操作
     *
     * @return {Promise<this>}
     */
    public async save(options?: SaveOrmOptions): Promise<this> {
        const entity = this.constructor as typeof BaseOrmEntity;
        const {ShardColumn, IndexColumn} = OrmEntityStorage.instance.get(entity.name);

        // 没有主键数据，返回报错
        if (!this.hasId()) {
            throw new ErrorMessage(10000, `Primary Key value not exist, EntityClass: ${entity.name}`);
        }

        try {
            // 查询分片字段和索引字段
            const shardValue = this[ShardColumn];
            const indexValue = this[IndexColumn];

            // 更新数据库前删除缓存(防止数据库操作失败，缓存已更新)
            await OrmFactory.removeVoCache(entity, shardValue, indexValue);

            // 更新数据库操作
            await entity.getRepository().save(this);

            // 仅在有缓存索引的情况下才更新缓存索引，如果缓存索引不存在，等下次数据库查询时更新全量的缓存索引。因为没有索引的情况下插入索引，会导致缓存不一致。
            // 缓存索引不存在的情况：
            //    情况1: 缓存索引到期失效
            //    情况2: 缓存索引被误删除（不考虑手动删除某一条缓存索引的情况）
            if ((await OrmFactory.getVoIndexCache(entity, shardValue)).length > 0) {
                await OrmFactory.setVoListIndexCache(entity, shardValue, String(indexValue));
            }

            // 双删策略，延迟删除缓存
            this.delayCache(entity, shardValue, indexValue, 300, 0);

            return this;
        } catch (e) {
            Logger.warn(`Entity ${entity.name} save failed:`, {
                error: e,
                entityData: this
            });
            throw e;
        }
    }

    /**
     * 重载 BaseEntity.remove()，增加对缓存的操作
     *
     * @return {Promise<this>}
     */
    public async remove(options?: SaveOrmOptions): Promise<any> {
        const entity = this.constructor as typeof BaseOrmEntity;
        const {ShardColumn, IndexColumn} = OrmEntityStorage.instance.get(entity.name);

        // 没有主键数据，返回报错，防止删错数据。
        if (!this.hasId()) {
            throw new ErrorMessage(10031, entity.name);
        }

        try {
            // 查询分片字段和索引字段
            const shardValue = this[ShardColumn];
            const indexValue = this[IndexColumn];

            // 更新数据库前删除缓存(防止数据库操作失败，缓存已更新)
            await OrmFactory.removeVoCache(entity, shardValue, indexValue);

            // 更新数据库操作
            await entity.getRepository().remove(this);

            // 数据库数据删除，删除该条缓存索引
            await OrmFactory.removeVoListIndexCache(entity, shardValue, indexValue);

            // 双删策略，延迟删除缓存
            this.delayCache(entity, shardValue, indexValue, 300, 0);

        } catch (e) {
            Logger.warn(`Entity ${entity.name} remove failed:`, {
                error: e,
                entityData: this
            });
            throw e;
        }
    }

    /**
     * 重载 BaseEntity.reload()
     *
     * @return {Promise<void>}
     */
    public async reload(): Promise<void> {
        const entity = this.constructor as typeof BaseOrmEntity;
        Object.assign(this, await entity.getRepository().findOneOrFail({
            where: entity.getId(this)
        }));
    }

    /**
     * 重构 BaseEntity.find()
     *
     * @return {Promise<void>}
     */
    public static async findList<T extends BaseOrmEntity>(
        this: { new(): T } & typeof BaseOrmEntity,
        condition: number | string | Partial<T>
    ): Promise<T[]> {
        const {ShardColumn} = OrmEntityStorage.instance.get(this.name);
        return BaseEntity.find.call(this, {
            where: (condition instanceof Object) ? condition : {[ShardColumn]: condition}
        });
    }

    /**
     * 重构 BaseEntity.findOne()
     *
     * @return {Promise<void>}
     */
    public static async findVo<T extends BaseOrmEntity>(
        this: { new(): T } & typeof BaseOrmEntity,
        condition: number | string | Partial<T>
    ): Promise<T> {
        const {ShardColumn} = OrmEntityStorage.instance.get(this.name);
        return BaseEntity.findOne.call(this, {
            where: (condition instanceof Object) ? condition : {[ShardColumn]: condition}
        });
    };

    /**
     * 延时淘汰缓存
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @param {number} delay
     * @param {number} times
     * @param {NodeJS.Timeout} lastTimeout
     */
    private delayCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue: string | number,
        delay: number = 300,
        times: number = 0,
        lastTimeout: NodeJS.Timeout = null
    ) {
        const MAX_RETRY = 3;

        if (times > MAX_RETRY) {
            Logger.warn(`Cache removal failed after ${MAX_RETRY} attempts for ${entity.name}`);
            if (lastTimeout !== null) clearTimeout(lastTimeout);
            return;
        }

        const timeoutId = setTimeout(async () => {
            try {
                await OrmFactory.removeVoCache(entity, shardValue, indexValue);
                if (lastTimeout !== null) clearTimeout(lastTimeout);
            } catch (error) {
                Logger.warn(`Cache removal retry ${times + 1}/${MAX_RETRY} failed:`, error);
                this.delayCache(entity, shardValue, indexValue, delay, times + 1, lastTimeout);
            }
        }, delay);
    }
}