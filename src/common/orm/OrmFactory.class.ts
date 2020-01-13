import * as LibFs from 'mz/fs';
import * as LibPath from 'path';
import {BaseEntity, Connection, createConnections, getConnectionManager, ObjectType, ConnectionOptions} from 'typeorm';
import {readfiles} from 'iterable-readfiles';
import {ToolUtils} from './utils/ToolUtils';
import {OrmEntityStorage} from './OrmEntityStorage';
import {CacheFactory} from '../cache/CacheFactory.class';
import {CommonTools, JsonTools, SharingTools} from '../Utility';
import {ErrorFormat} from '../exception/ErrorFormat';

export type EntityVo<T extends BaseEntity> = T;
export type EntityVoList<T extends BaseEntity> = Map<number, EntityVo<T>>; // key 必须是 number，一般是 shardVColumn 或 indexColumn

export class OrmFactory {
    
    private static _instance: OrmFactory;
    private _initialized: boolean;
    private _entityConn: { [className: string]: Array<string> } = {};
    private _entityInfo: { [className: string]: Array<{ shardClassName: string, shardClassPath: string }> } = {};
    private _entityMap: { [key: string]: any } = {};
    private _dbConfig: Array<ConnectionOptions>;
    
    public static instance(): OrmFactory {
        if (OrmFactory._instance == undefined) {
            OrmFactory._instance = new OrmFactory();
        }
        return OrmFactory._instance;
    }
    
    private constructor() {
        this._initialized = false;
    }
    
    /**
     * 游戏启动时，进行初始化
     * 1. 根据 EntityClass File 的文件内容，进行文件拷贝，生成对应分表数量。
     * 2. 和 MySQL 建立连接。
     * @return {Promise<void>}
     */
    public async init(dbConfig: Array<ConnectionOptions>) {
        this._initialized = true;
        this._dbConfig = dbConfig;
        await this._copyEntityFile();
        await this._createConnection();
    }
    
    /**
     * 拷贝 EntityClass 文件
     *
     * @return {Promise<void>}
     * @private
     */
    private async _copyEntityFile() {
        // 遍历 options
        for (const option of this._dbConfig) {
            if (option.entities.length <= 0) {
                CommonTools.logger(`${option.name} has no any entities.`);
            }
            
            // 通常是直接使用 project/entity/*.js 加载全部的，所以直接取 0 即可。
            let entityFilePath = option.entities[0];
            let entityBaseFiles = await readfiles(LibPath.dirname(entityFilePath as string), [(path: string): boolean => {
                // ignore file：/project/entity/*_*.js
                let shallIgnore = false;
                if (LibPath.basename(path).indexOf('_') != -1) {
                    shallIgnore = true;
                }
                return shallIgnore;
            }]);
            
            // 根据 entityBaseFile，按 shardCount, 逐个生成 entityFile
            for (const filePath of entityBaseFiles) {
                // 获取当前 EntityClass 的相关信息
                const content = await LibFs.readFile(filePath, 'utf-8');
                const entityShardCount = await ToolUtils.getShardCount(content);
                const entityTableName = await ToolUtils.getTableName(content);
                const entityInfo = LibPath.parse(filePath);
                const entityClassName = entityInfo.name;
                this._saveEntityConn(entityClassName, option.name);
                
                // 如果分表数量不大于 1，或没有设置 @Entity(), 则代表不需要分表
                if (entityShardCount <= 1 || entityTableName == null) {
                    this._saveEntityInfo(entityClassName, entityClassName, filePath);
                    this._saveEntityMap(entityClassName, filePath);
                    continue;
                }
                
                // 将原表根据分表数量进行拷贝和重写
                for (let i = 0; i < entityShardCount; i++) {
                    // 计算数据表分片
                    const suffix = ToolUtils.suffix(i, entityShardCount);
                    const copyPath = await ToolUtils.copyFile(filePath, entityClassName, suffix);
                    const className = await ToolUtils.rewriteFile(copyPath, entityClassName, suffix, content, entityTableName);
                    
                    this._saveEntityConn(className, option.name);
                    this._saveEntityInfo(entityClassName, className, copyPath);
                    this._saveEntityMap(className, copyPath);
                }
            }
        }
    }
    
    /**
     * 创建数据库客户端连接
     *
     * @return {Promise<void>}
     * @private
     */
    private async _createConnection() {
        await createConnections(this._dbConfig);
        this._initialized = true;
    }
    
    /**
     * 提供给外部获取连接的方法
     *
     * @param {ObjectType<T extends BaseEntity>} entity
     * @return {Connection}
     */
    public getConnection<T extends BaseEntity>(entity: ObjectType<T>): Connection {
        if (!this._initialized) {
            throw new ErrorFormat(30001, 'OrmFactory');
        }
        
        // className 不存在
        let className = entity.name;
        let connectionName = this._dbConfig[0].name;
        
        // 由 GetEntity 生成的 EntityClass，原型链上必定有 shardId 字段，来查找对应的连接名
        if (entity.prototype.shardId
            && this._entityConn.hasOwnProperty(className)
            && this._entityConn[className].length > 1) {
            connectionName = this._entityConn[className][entity.prototype.shardId];
        }
        
        return getConnectionManager().get(connectionName);
    }
    
    // 每个 entityClass 都可能存放在不同的 connection option 中
    private _saveEntityConn(className, connectionName) {
        if (!this._entityConn.hasOwnProperty(className)) {
            this._entityConn[className] = [];
        }
        this._entityConn[className].push(connectionName);
    }
    
    // 每个 entityClass 都可能存放在不同的 connection option 中
    private _saveEntityInfo(entityClassName: string, className: string, classPath: string) {
        if (!this._entityInfo.hasOwnProperty(entityClassName)) {
            this._entityInfo[entityClassName] = [];
        }
        this._entityInfo[entityClassName].push({
            shardClassName: className,
            shardClassPath: classPath
        });
    }
    
    // 每个 entityClass 都可能存放在不同的 connection option 中
    private _saveEntityMap(className: string, classPath: string) {
        if (!this._entityMap[className]) {
            this._entityMap[className] = require(classPath)[className];
            
            // 预先加载是在项目启动时，如果没有加载到应该直接报错
            if (!this._entityMap[className]) {
                throw new ErrorFormat(700106, className);
            }
        }
    }
    
    /**
     * let EntityModule = OrmFactory.instance().getEntity(BaseEntity.name, shardColumnValue);
     *
     * @param {Function} entity
     * @param {number} shardColumnValue
     * @return {typeof BaseEntity}
     */
    public getEntity(entity: Function, shardColumnValue: number = 0): typeof BaseEntity {
        if (!this._initialized) {
            throw new ErrorFormat(30001, 'OrmFactory');
        }
        
        // 如果已经分片过，则直接返回当前的 entity
        const className = entity.name;
        if ((className.indexOf('_') != -1) && typeof (entity) == 'function') {
            return entity as any;
        }
        
        // 没有找到 Entity
        const classStorageType = OrmEntityStorage.instance.get(className);
        if (classStorageType == null) {
            throw new ErrorFormat(700104, className);
        }
        if (!this._entityConn.hasOwnProperty(className) || !this._entityInfo.hasOwnProperty(className)) {
            throw new ErrorFormat(700104, className);
        }
        
        // 根据分库数量，获取分库的分片 id
        const tableCount = classStorageType.ShardTable;
        const tableShardId = SharingTools.getShardId(tableCount, shardColumnValue);
        
        // 查找 className 对应的分片表的信息
        const shardEntityInfo = this._entityInfo[className][tableShardId];
        if (!shardEntityInfo) {
            throw new ErrorFormat(700105, className);
        }
        // 查找 className 和 tableShardId 对应的 Entity 实例
        const shardEntity = this._entityMap[shardEntityInfo.shardClassName];
        if (!shardEntity) {
            throw new ErrorFormat(700106, shardEntityInfo.shardClassName);
        }
        
        // 将数据库分片 ID 加入到原型链
        shardEntity.prototype.shardId = SharingTools.getShardId(this._entityConn[className].length, shardColumnValue);
        
        // 加载 Entity File
        return shardEntity;
    }
    
    /**
     * 创建一个 entity 实例
     *
     * @param {ObjectType<T>} entity
     * @param {number} shardValue
     * @param {Object} data
     * @param {boolean} hasEntityShard
     * @return {T}
     */
    public static createEntity<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number, data?: Object, hasEntityShard: boolean = false): T {
        // 如果尚未分片，需要进行一次分片
        let target = entity;
        if (!hasEntityShard) {
            target = OrmFactory.instance().getEntity(entity, shardValue);
        }
        
        // 创建一个空的 entity 实例
        const entityInstance = (target as any).create();
        if (!data) {
            return entityInstance;
        }
        
        return Object.assign(entityInstance, data);
    }
    
    /**
     * 获取 EntityVo
     *
     * @param {ObjectType<T extends BaseEntity>} entity
     * @param {number} shardValue
     * @param {number} indexValue
     * @return {Promise<T extends BaseEntity>}
     */
    public static async getVo<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number, indexValue?: number): Promise<T> {
        // 需要先根据传入的 Entity 进行一次分片，防止数据库 table_name 丢失
        let target = OrmFactory.instance().getEntity(entity, shardValue);
        
        // 参数验证
        const {HaveRowList} = OrmEntityStorage.instance.get(target.name);
        if (HaveRowList && (!shardValue || !indexValue)) {
            throw new ErrorFormat(700103, target.name);
        }
        
        if (!indexValue) {
            indexValue = shardValue;
        }
        
        // 缓存命中，需要将 data 封装成 entity 再返回
        const entityInstance = await this.getVoCache<T>(target, shardValue, indexValue);
        if (entityInstance) {
            return entityInstance;
        }
        
        // 缓存未命中，数据库命中，将数据塞入缓存，并返回 entity
        const entityInstances = await this.select<T>(target, shardValue, indexValue);
        if (entityInstances && entityInstances.length > 0) {
            // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
            let listMap = this._coverRowListToEntityListMap<T>(target, entityInstances);
            await this.setVoListCache<T>(target, shardValue, listMap);
            return listMap.get(indexValue);
        }
        return null;
    }
    
    /**
     * 获取 EntityVoList
     *
     * @param {ObjectType<T extends BaseEntity>} entity
     * @param {number} shardValue
     * @return {Promise<EntityVoList<T extends BaseEntity>>}
     */
    public static async getVoList<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number): Promise<EntityVoList<T>> {
        let target = OrmFactory.instance().getEntity(entity, shardValue);
        
        // 参数验证
        const {HaveRowList} = OrmEntityStorage.instance.get(target.name);
        if (!HaveRowList) {
            throw new ErrorFormat(700102, target.name);
        }
        
        // 缓存命中，需要将 data 封装成 entity[] 再返回
        let listMap = await this.getVoListCache<T>(target, shardValue);
        if (listMap.size > 0) {
            return listMap;
        }
        
        // 缓存未命中，数据库命中，将数据塞入缓存，并返回 entity
        if (listMap.size == 0) {
            const entitys = await this.select<T>(target, shardValue);
            if (entitys && entitys.length > 0) {
                // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
                let listMap = this._coverRowListToEntityListMap<T>(target, entitys);
                await this.setVoListCache<T>(target, shardValue, listMap);
                return listMap;
            }
        }
        return listMap;
    }
    
    /**
     * 将 数据库的 row 转换成以 indexColumn 为 Key 的 Map
     *
     * @param {ObjectType<T>} entity
     * @param {any[]} dataList
     * @return {EntityVoList<Object>}
     * @private
     */
    private static _coverRowListToEntityListMap<T extends BaseEntity>(entity: ObjectType<T>, dataList: any[]): EntityVoList<T> {
        let {IndexColumn} = OrmEntityStorage.instance.get(entity.name);
        let listMap: EntityVoList<T> = new Map();
        dataList.forEach((data) => {
            if (data.hasOwnProperty(IndexColumn)) {
                listMap.set(Number(data[IndexColumn]), data);
            }
        });
        return listMap;
    }
    
    /**
     * 将 entity vo 保存到缓存
     *
     * @param {ObjectType<T>} entity
     * @param {number} shardValue
     * @param {number} indexValue
     * @param {EntityVo<Object>} vo
     * @return {Promise<void>}
     * @private
     */
    public static async setVoCache<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number, indexValue: number, vo: EntityVo<T>): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).hSet(cacheKey, indexValue, vo);
    }
    
    /**
     * 将 entity voList 保存到缓存
     *
     * @param {ObjectType<T>} entity
     * @param {number} shardValue
     * @param {EntityVoList<Object>} listMap
     * @return {Promise<void>}
     * @private
     */
    public static async setVoListCache<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number, listMap: EntityVoList<T>): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).hMSet(cacheKey, JsonTools.mapToObj(listMap));
    }
    
    /**
     * 将 entity vo 从缓存中删除
     *
     * @param {ObjectType<T>} entity
     * @param {number} shardValue
     * @param {number} indexValue
     * @return {Promise<void>}
     * @private
     */
    public static async removeVoCache<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number, indexValue: number): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).hDel(cacheKey, indexValue as any);
    }
    
    /**
     * 从缓存中获取 Vo 数据
     *
     * @param {ObjectType<T extends BaseEntity>} entity
     * @param {number} shardValue
     * @param {number} indexValue
     * @return {Promise<T extends BaseEntity>}
     * @private
     */
    public static async getVoCache<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number, indexValue?: number): Promise<T> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        const cacheData = await CacheFactory.instance().getCache(shardValue).hGet(cacheKey, indexValue);
        
        if (!cacheData) {
            return null;
        }
        
        return OrmFactory.createEntity<T>(entity, shardValue, cacheData);
    }
    
    /**
     * 从缓存里获取 VoList 数据
     *
     * @param {ObjectType<T extends BaseEntity>} entity
     * @param {number} shardValue
     * @return {Promise<EntityVoList<T extends BaseEntity>>}
     * @private
     */
    public static async getVoListCache<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number): Promise<EntityVoList<T>> {
        /**
         * 从 hGetAll 的结果 {[key: string]: any}，所以存到 MAP 时候，key 要转成 number
         */
        const cacheKey = this.cacheKey(entity.name, shardValue);
        const cacheDataList = await CacheFactory.instance().getCache(shardValue).hGetAll(cacheKey) as { [key: string]: any };
        
        let listMap = new Map();
        if (!cacheDataList) {
            return listMap;
        }
        
        for (let key of Object.keys(cacheDataList)) {
            listMap.set(Number(key), OrmFactory.createEntity(entity, shardValue, cacheDataList[key]));
        }
        
        return listMap;
    }
    
    /**
     * 数据库查询 select
     *
     * @param {ObjectType<T>} entity
     * @param {number} shardValue
     * @param {number} indexValue
     * @return {Promise<T[]>}
     * @private
     */
    public static select<T extends BaseEntity>(entity: ObjectType<T>, shardValue: number, indexValue?: number): Promise<T[]> {
        const entityInfo = OrmEntityStorage.instance.get(entity.name);
        
        // build Search Condition
        let condition = {};
        if (shardValue) {
            condition[entityInfo.ShardColumn] = shardValue;
        } else {
            throw new ErrorFormat(700101, entity.name);
        }
        
        if (indexValue && entityInfo.HaveRowList == false && entityInfo.ShardColumn != entityInfo.IndexColumn) {
            condition[entityInfo.IndexColumn] = indexValue;
        }
        
        // search db
        return (entity as any).find(condition);
    }
    
    /**
     * 生成 Cache Key
     *
     * @param entityName
     * @param shardValue
     * @private
     */
    private static cacheKey(entityName, shardValue) {
        const entityInfo = OrmEntityStorage.instance.get(entityName);
        const cacheName = entityInfo.CacheName ? entityInfo.CacheName : entityName;
        return CommonTools.format('%s:%s', cacheName, shardValue);
    }
}
