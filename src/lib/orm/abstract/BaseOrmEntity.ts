import {BaseEntity, Repository, SaveOptions} from 'typeorm';
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
     * 重载 BaseEntity.getRepository()，按分片规则（entity.prototype.shardId）选择对应的数据源，恢复分库
     *
     * @return {Repository<T extends BaseEntity>}
     */
    public static getRepository<T extends BaseEntity>(this: any): Repository<T> {
        const connection = OrmFactory.instance().getConnection(this);
        return connection.getRepository<T>(this);
    }

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

            // 写缓存：版本号 +1（使在途读回填失效）后由写者直接写入新值；
            // 并发写同分片不同行时字段互不冲突，无需 CAS/重试
            if (shardValue != null && indexValue != null) {
                await OrmFactory.incrVoVersion(entity, shardValue);
                await OrmFactory.setVoCache(entity, shardValue, indexValue, this);
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

            // 版本号 +1，使在途读请求的 CAS 失效；随后由写者直接写入新值（写库成功后写入）
            if (shardValue != null && indexValue != null) {
                await OrmFactory.incrVoVersion(entity, shardValue);
                await OrmFactory.setVoCache(entity, shardValue, indexValue, this);
            }

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

            // 版本号 +1，使在途读请求的 CAS 失败，杜绝脏缓存回写
            await OrmFactory.incrVoVersion(entity, shardValue);

            // 更新数据库前删除缓存(防止数据库操作失败，缓存已更新)
            await OrmFactory.removeVoCache(entity, shardValue, indexValue);

            // 更新数据库操作
            await entity.getRepository().remove(this);

            // 删除删除期间被并发读回填的脏缓存
            await OrmFactory.removeVoCache(entity, shardValue, indexValue);

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

}
