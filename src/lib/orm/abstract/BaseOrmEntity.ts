import {BaseEntity, Repository, SaveOptions} from 'typeorm';
import {OrmFactory} from '../OrmFactory.class';
import {OrmEntityStorage} from '../OrmEntityStorage';
import {OrmTypeUtils} from '../utils/OrmTypeUtils';
import {ErrorMessage} from '../../exception/ErrorMessage';
import {CacheFactory} from '../../cache/CacheFactory.class';
import {RedisLock, REDIS_LOCK_DEFAULT} from '../../lock/RedisLock';
import {RandomTools} from '../../tools/RandomTools';
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
     * 归一化主键/分片/索引字段的值类型，使其与数据库列类型一致。
     *
     * TypeORM 的 save() 会用实体字段值和数据库行做严格比较（compareIds：100 !== '100'），
     * 如果 varchar 列在缓存里存了 number（如 game: 100），匹配会失败，把更新误判成插入导致主键冲突。
     * 在 insert/save 写库、写缓存前调用，保证缓存内容与数据库返回类型一致。
     */
    private static _normalizeKeyColumns<T extends BaseOrmEntity>(entity: T): void {
        const entityClass = entity.constructor as typeof BaseOrmEntity;
        const {ShardColumn, IndexColumn} = OrmEntityStorage.instance.get(entityClass.name);
        const metadata = entityClass.getRepository().metadata;
        const keyColumns = new Set<string>(metadata.primaryColumns.map((column) => column.propertyName));
        if (ShardColumn) keyColumns.add(String(ShardColumn));
        if (IndexColumn) keyColumns.add(String(IndexColumn));

        for (const column of metadata.columns) {
            if (!keyColumns.has(column.propertyName)) continue;
            const value = column.getEntityValue(entity);
            if (value == null) continue;
            const normalized = OrmTypeUtils.normalizeValue(column.type, value);
            if (normalized !== value) {
                column.setEntityValue(entity, normalized);
            }
        }
    }

    /**
     * 写库/删除失败后，用数据库当前值恢复被删除的缓存字段（best-effort，不掩盖原始错误）。
     * 避免"缓存字段被 hDel 后 DB 操作失败"导致该行在缓存中隐身。
     */
    private static async _restoreVoCache<T extends BaseOrmEntity>(
        entity: typeof BaseOrmEntity,
        shardValue: string | number,
        indexValue: string | number,
        instance: T
    ): Promise<void> {
        if (shardValue == null || indexValue == null) return;
        try {
            const row = await (entity.getRepository() as Repository<T>).findOne({where: entity.getId(instance)});
            if (row) {
                await OrmFactory.setVoCache(entity, shardValue, indexValue, row);
            }
        } catch (restoreErr) {
            Logger.warn(`Entity ${entity.name} restore cache failed:`, {error: restoreErr});
        }
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
            // 归一化主键/分片/索引字段类型，避免脏类型进入数据库和缓存
            BaseOrmEntity._normalizeKeyColumns(this);
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

        // 归一化主键/分片/索引字段类型，保证 identifier 与数据库行严格匹配（否则会被误判为 INSERT）
        BaseOrmEntity._normalizeKeyColumns(this);

        // 查询分片字段和索引字段
        const shardValue = this[ShardColumn];
        const indexValue = this[IndexColumn];

        if (!shardValue || !indexValue) {
            throw new ErrorMessage(10037, entity.name);
        }

        // 锁获取顺序 == MySQL 提交顺序 == 缓存写入顺序，缓存最终值必然等于最后提交者的值。
        const cache = CacheFactory.instance().getCache(shardValue);
        const lockKey = `saveLock:${entity.name}:${shardValue}:${indexValue}`;
        const lockToken = RandomTools.uuid();

        // 轮询获取锁：直到成功或超过 timeoutMs
        const acquired = await RedisLock.acquire(cache, lockKey, lockToken);
        if (!acquired) {
            throw new ErrorMessage(10007, lockKey, REDIS_LOCK_DEFAULT.timeoutMs);
        }

        try {
            // 更新数据库前删除缓存(防止数据库操作失败，缓存已更新)
            await OrmFactory.removeVoCache(entity, shardValue, indexValue);

            // 更新数据库操作
            await entity.getRepository().save(this);

            // 版本号 +1，使在途读请求的 CAS 失效；随后由写者直接写入新值（写库成功后写入）
            await OrmFactory.incrVoVersion(entity, shardValue);
            await OrmFactory.setVoCache(entity, shardValue, indexValue, this);

            return this;
        } catch (e) {
            Logger.warn(`Entity ${entity.name} save failed:`, {
                error: e,
                entityData: this
            });
            // 写库失败后用数据库当前值恢复缓存字段，避免该行在缓存中隐身
            await BaseOrmEntity._restoreVoCache(entity, shardValue, indexValue, this);
            throw e;
        } finally {
            // 释放锁：best-effort。
            // 临界区超 TTL 时锁已被回收（release 返回 false），或 Redis 抖动导致 release 抛错——均只告警，不掩盖业务结果。
            try {
                await RedisLock.release(cache, lockKey, lockToken);
            } catch (releaseErr) {
                Logger.warn(`Entity ${entity.name} save lock release failed:`, {error: releaseErr});
            }
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

        // 归一化主键/分片/索引字段类型，保证 identifier 与数据库行严格匹配
        BaseOrmEntity._normalizeKeyColumns(this);

        // 查询分片字段和索引字段
        const shardValue = this[ShardColumn];
        const indexValue = this[IndexColumn];

        try {
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
            // 删除失败说明行还在，用数据库当前值恢复缓存字段
            await BaseOrmEntity._restoreVoCache(entity, shardValue, indexValue, this);
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
