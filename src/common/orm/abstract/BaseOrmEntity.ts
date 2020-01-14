import * as _ from 'underscore';
import {BaseEntity, Connection, ObjectType, Repository, SaveOptions} from 'typeorm';
import {OrmFactory} from '../OrmFactory.class';
import {OrmEntityStorage} from '../OrmEntityStorage';
import {ErrorFormat} from '../../exception/ErrorFormat';

interface SaveOrmOptions extends SaveOptions {
    async?: boolean,
}

/**
 * Base abstract entity for get entities, used in ActiveRecord patterns.
 */
export class BaseOrmEntity extends BaseEntity {

    /**
     * Gets current entity's Repository.
     */
    public static getRepository<T extends BaseEntity>(this: ObjectType<T>): Repository<T> {
        const connection: Connection = OrmFactory.instance().getConnection(this);
        return connection.getRepository<T>(this);
    }
    
    /**
     * 重载 BaseEntity.insert()，增加对缓存的操作
     *
     * @return {Promise<this>}
     */
    public async insert(options?: SaveOrmOptions): Promise<this> {
        const entity = this.constructor as typeof BaseEntity;
        
        // 判断是否同步，同步则等待数据库响应
        if (options && options.async === true) {
            entity.getRepository().insert(this).catch((e) => console.log(e));
        } else {
            await entity.getRepository().insert(this);
        }
        
        // fixme：异步的情况下，this 返回的内容不包含自增长的字段内容。
        return this;
    }
    
    /**
     * 重载 BaseEntity.save()，增加对缓存的操作
     *
     * @return {Promise<this>}
     */
    public async save(options?: SaveOrmOptions): Promise<this> {
        const entity = this.constructor as typeof BaseEntity;

        // 没有主键数据，返回报错
        if (!this.hasId()) {
            throw new ErrorFormat(100000, `Primary Key value not exist, EntityClass: ${entity.name}`);
        }

        // 根据主键进行存储
        let condition = entity.getId(this);
        let shardValue = condition;
        let indexValue = condition;
        if (_.isObject(condition)) {
            const {ShardColumn, IndexColumn} = OrmEntityStorage.instance.get(entity.name);
            shardValue = condition[ShardColumn];
            indexValue = condition[IndexColumn];
        }
        
        await OrmFactory.setVoCache(entity, shardValue, indexValue, this);
        
        // 判断是否同步，同步则等待数据库响应
        if (options && options.async === true) {
            entity.getRepository().save(this).catch((e) => console.log(e));
        } else {
            await entity.getRepository().save(this);
        }
    
        // fixme：异步的情况下，this 返回的内容不包含自增长的字段内容。
        return this;
    }

    /**
     * 重载 BaseEntity.remove()，增加对缓存的操作
     *
     * @return {Promise<this>}
     */
    public async remove(options?: SaveOrmOptions): Promise<any> {
        const entity = this.constructor as typeof BaseEntity;

        // 没有主键数据，返回报错，防止删错数据。
        if (!this.hasId()) {
            throw new ErrorFormat(700101, entity.name);
        }

        // 根据主键进行存储
        const condition = entity.getId(this);
        let shardValue = condition;
        let indexValue = condition;
        if (_.isObject(condition)) {
            const {ShardColumn, IndexColumn} = OrmEntityStorage.instance.get(entity.name);
            shardValue = condition[ShardColumn];
            indexValue = condition[IndexColumn];
        }

        await OrmFactory.removeVoCache(entity, shardValue, indexValue);
        
        // 判断是否同步，同步则等待数据库响应
        if (options && options.async === true) {
            entity.getRepository().remove(this).catch((e) => console.log(e));
        } else {
            await entity.getRepository().remove(this);
        }
    }

    /**
     * 重载 BaseEntity.reload()
     *
     * @return {Promise<void>}
     */
    public async reload(): Promise<void> {
        let entity = this.constructor as typeof BaseEntity;
        Object.assign(this, await entity.getRepository().findOneOrFail(entity.getId(this)));
    }
}