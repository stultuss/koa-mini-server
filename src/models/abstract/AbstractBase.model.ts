import * as _ from 'underscore';
import {BaseEntity, ObjectType} from 'typeorm';
import {BaseOrmEntity} from '../../common/orm/abstract/BaseOrmEntity';
import {EntityVo, EntityVoList, OrmFactory} from '../../common/orm/OrmFactory.class';
import {OrmEntityStorage, StorageType} from '../../common/orm/OrmEntityStorage';
import {JsonTools} from '../../common/Utility';

export abstract class AbstractBaseModel<T extends BaseOrmEntity> {
    
    /**
     * 保存 ModelCache，Key 是 EntityClassName，Value 保存的是 EntityVo 或者 EntityVoList
     */
    protected _cache: Map<string, EntityVo<T> | EntityVoList<T>>;
    protected _originCache: Map<string, EntityVo<T> | EntityVoList<T>>;
    protected _target: ObjectType<T>;
    
    public abstract create(data?: Object): EntityVo<T>;
    
    public abstract async get(): Promise<EntityVo<T> | EntityVoList<T>>;
    
    public abstract async set(value: EntityVo<T> | EntityVoList<T>): Promise<EntityVo<T> | EntityVoList<T>>;
    
    public abstract async format(): Promise<EntityVo<T> | Object>;
    
    /**
     * 初始化
     */
    protected constructor(entity: ObjectType<T>) {
        this._cache = new Map<string, any>();
        this._originCache = new Map<string, any>();
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
     * 通过 Entity 保存 Entity Value
     *
     * @param {EntityVo<T extends BaseEntity> | EntityVoList<T extends BaseEntity>} value
     * @private
     */
    protected _saveOriginCache(value: EntityVo<T> | EntityVoList<T> = null) {
        this._originCache.set(this._target.name, value);
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
     * 通过 Entity 获取 Entity Value
     *
     * @return {EntityVo<T extends BaseEntity> | EntityVoList<T extends BaseEntity>}
     * @private
     */
    protected _loadOriginCache(): EntityVo<T> | EntityVoList<T> {
        return this._originCache.get(this._target.name);
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
     * 获取数据，并保存到缓存
     *
     * @param {number} shardValue
     * @param {boolean} isList
     * @return {Promise<R>}
     * @private
     */
    protected async _get<R>(shardValue: number, isList: boolean = false): Promise<R> {
        let data: R;
        if (this._hasCache()) {
            data = this._loadCache() as any;
        } else {
            let originData;
            if (isList) {
                data = await OrmFactory.getVoList(this._target, shardValue) as any;
                originData = new Map();
                for (let [k, v] of data as any) {
                    originData.set(k, Object.assign({}, Object.create(Object.getPrototypeOf(v)), v));
                }
            } else {
                data = await OrmFactory.getVo(this._target, shardValue) as any;
                originData = (data) ? Object.assign({}, Object.create(Object.getPrototypeOf(data)), data) : null;
            }
            
            // 不管是否存在返回数据，都需要存到缓存中，否则每次 get 无数据的行，都会去请求 redis 和 mysql
            this._saveCache(data as any);
            this._saveOriginCache(originData as any);
        }
        return data;
    }
    
    public async _find<R>(shardValue: number, indexValue: number): Promise<R>  {
        return await OrmFactory.getVo(this._target, shardValue, indexValue) as any;
    }
    
    /**
     * 数据持久化
     *
     * @param {boolean} async
     * @return {Promise<void>}
     */
    public async persist(async = true): Promise<void> {
        // 数据有更新，才需要变更数据
        const queues = [];
        const options = {
            async: async
        };
        const {HaveRowList} = OrmEntityStorage.instance.get(this._target.name);
        if (HaveRowList) {
            let changedData = this._loadCache() as EntityVoList<T>;
            let originData = this._loadOriginCache() as EntityVoList<T>;
            
            // 如果没有操作，跳过操作
            if (!changedData && !originData) {
                return;
            }
            
            if (JsonTools.mapToJson(changedData) == JsonTools.mapToJson(originData)) {
                return;
            }
            
            // save EntityVoList
            if (changedData.size == 0 && originData.size > 0) {
                //  EntityVoList 已经被清空，需要逐个删除 EntityVo
                for (let [k, v] of originData) {
                    const vo = this.create(v);
                    queues.push(vo.remove(options));
                    originData.delete(k);
                }
            } else {
                // Loop origin data，判断是否有删除某个 EntityVo
                for (let [k, v] of originData) {
                    if (changedData.has(k) == false) {
                        const vo = this.create(v);
                        queues.push(vo.remove(options));
                        originData.delete(k);
                    }
                }
                
                // Loop changed data, 并保存 EntityVo
                for (let [k, v] of changedData) {
                    if (originData.has(k) && this._isObjectValueEqual(v, originData.get(k)) == true) {
                        continue;
                    }
                    queues.push(v.save(options));
                    originData.set(k, Object.assign({}, Object.create(Object.getPrototypeOf(v)), v));
                }
            }
            
            this._saveCache(changedData);
            this._saveOriginCache(originData);
        } else {
            let changedData = this._loadCache() as EntityVo<T>;
            let originData = this._loadOriginCache() as EntityVo<T>;
            
            // 如果没有操作，跳过操作
            if (!changedData && !originData) {
                return;
            }
            
            // save EntityVo
            if (this._isObjectValueEqual(changedData, originData) == false) {
                queues.push(changedData.save(options));
                this._saveCache(changedData);
                this._saveOriginCache(Object.assign({}, Object.create(Object.getPrototypeOf(changedData)), changedData));
            }
        }
        
        // 没有需要处理的东西
        if (queues.length == 0) {
            return;
        }
        
        await Promise.all(queues).catch(err => console.log(err));
    }
    
    private _isObjectValueEqual(a, b) {
        if (!_.isObject(a) || !_.isObject(b)) {
            return false;
        }
        // Of course, we can do it use for in
        // Create arrays of property names
        const aProps = Object.getOwnPropertyNames(a);
        const bProps = Object.getOwnPropertyNames(b);
        
        // If number of properties is different,
        // objects are not equivalent
        if (aProps.length != bProps.length) {
            return false;
        }
        
        for (let i = 0; i < aProps.length; i++) {
            const propName = aProps[i];
            
            // If values of same property are not equal,
            // objects are not equivalent
            if (a[propName] !== b[propName]) {
                return false;
            }
        }
        
        // If we made it this far, objects
        // are considered equivalent
        return true;
    }
    
    public getEntity(): ObjectType<T> {
        return this._target;
    }
    
    public getStorageType(): StorageType {
        return OrmEntityStorage.instance.get(this._target.name);
    }
    
}
