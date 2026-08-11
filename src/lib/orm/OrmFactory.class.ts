import * as fsp from 'fs/promises';
import * as path from 'path';
import {DataSource, DataSourceOptions, In, ObjectType} from 'typeorm';
import {FileTools} from '../tools/FileTools';
import {ErrorMessage} from '../exception/ErrorMessage';
import {CacheFactory} from '../cache/CacheFactory.class';
import {ShardingTools} from '../tools/ShardingTools';
import {BaseOrmEntity} from './abstract/BaseOrmEntity';
import {OrmEntityStorage} from './OrmEntityStorage';
import {OrmUtils} from './utils/OrmUtils';
import {Logger} from '../Logger';
import {Utils} from '../Utils';

export type EntityVo<T extends BaseOrmEntity> = T;
export type EntityVoList<T extends BaseOrmEntity> = { [key: string]: EntityVo<T> }; // 一般是 shardColumn 或 indexColumn
export type EntityClass<T extends BaseOrmEntity> = ObjectType<T>;

const INDEX_CACHE = ':index';

export class OrmFactory {

    private static _instance: OrmFactory;
    private _initialized: boolean;
    private _entityConn: { [className: string]: Array<string> } = {};
    private _entityInfo: { [className: string]: Array<{ shardClassName: string, shardClassPath: string }> } = {};
    private _entityMap: { [key: string]: any } = {};
    private _dbConfig: { [key: string]: Array<DataSourceOptions> };
    private _dataSources: { [key: string]: DataSource } = {};

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
    public async init(dbConfig: { [key: string]: Array<DataSourceOptions> }): Promise<void> {
        // 避免重复初始化
        if (this._initialized) {
            return;
        }

        this._dbConfig = dbConfig;
        this._validateEntities(dbConfig);
        await this._copyEntityFile();
        await this._createConnection();
        this._initialized = true;
    }

    /**
     * 验证实体配置
     * 
     * @param dbConfig 
     * @return {void}
     * @private
     */
    private _validateEntities(dbConfig: { [key: string]: Array<DataSourceOptions> }): void {
        const seen = new Map<string, string>();
        for (const key of Object.keys(dbConfig)) {
            for (const opt of dbConfig[key]) {
                const glob = (Array.isArray(opt.entities) && opt.entities.length > 0) ? String(opt.entities[0]) : null;
                if (!glob) continue;
                if (seen.has(glob)) {
                    throw new ErrorMessage(10037,
                        `entities "${glob}" duplicated in config [${seen.get(glob)}] and [${key}]. ` +
                        `Each entities glob must belong to only one config.`
                    );
                }
                seen.set(glob, key);
            }
        }
    }

    /**
     * 拷贝 EntityClass 文件
     *
     * @return {Promise<void>}
     * @private
     */
    private async _copyEntityFile(): Promise<void> {
        // 遍历 configs
        for (const key of Object.keys(this._dbConfig)) {
            // 遍历 options
            for (const option of this._dbConfig[key]) {
                if (!Array.isArray(option.entities) || option.entities.length <= 0) {
                    Logger.warn(`${option.database} has no any entities.`);
                    continue;
                }

                // 通常是直接使用 project/entity/*.js 加载全部的，所以直接取 0 即可。
                const entityFilePath = option.entities[0];
                const entityBaseFiles = await FileTools.listFiles(
                    path.dirname(entityFilePath as string),
                    [(filepath: string): boolean => (path.basename(filepath).indexOf('_') != -1)]
                );

                // 根据 entityBaseFile，按 shardCount, 逐个生成 entityFile
                for (const filePath of entityBaseFiles) {
                    // 获取当前 EntityClass 的相关信息
                    const content = await fsp.readFile(filePath, 'utf-8');
                    const entityShardCount = await OrmUtils.getShardCount(content);
                    const entityTableName = await OrmUtils.getTableName(content);
                    const entityInfo = path.parse(filePath);
                    const entityClassName = entityInfo.name;
                    this._saveEntityConn(entityClassName, option.database);

                    // 如果分表数量不大于 1，或没有设置 @Entity(), 则代表不需要分表
                    if (entityShardCount <= 1 || entityTableName == null) {
                        this._saveEntityInfo(entityClassName, entityClassName, filePath);
                        this._saveEntityMap(entityClassName, filePath);
                        continue;
                    }

                    // 将原表根据分表数量进行拷贝和重写
                    for (let i = 0; i < entityShardCount; i++) {
                        // 计算数据表分片
                        const suffix = OrmUtils.suffix(i, entityShardCount);
                        const copyPath = await OrmUtils.copyFile(filePath, entityClassName, suffix);
                        const className = await OrmUtils.rewriteFile(copyPath, entityClassName, suffix, content, entityTableName);

                        this._saveEntityConn(className, option.database);
                        this._saveEntityInfo(entityClassName, className, copyPath);
                        this._saveEntityMap(className, copyPath);
                    }
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
    private async _createConnection(): Promise<void> {
        // 遍历 configs
        for (const key of Object.keys(this._dbConfig)) {
            for (const config of this._dbConfig[key]) {
                const dataSource = new DataSource(config);
                await dataSource.initialize();
                this._dataSources[String(config.database)] = dataSource;
            }
        }
        this._initialized = true;
    }

    /**
     * 根据数据源名称获取对应的 DataSource 实例
     *
     * @param {any} name - 数据源名称
     * @returns {DataSource} 返回对应的 DataSource 实例
     */
    public getDataSource(name: any): DataSource {
        return this._dataSources[String(name)];
    }

    /**
     * 提供给外部获取连接的方法
     *
     * @param {EntityClass<T>} entity
     * @return {DataSource}
     */
    public getConnection<T extends BaseOrmEntity>(entity: EntityClass<T>): DataSource {
        if (!this._initialized) {
            throw new ErrorMessage(10000, 'OrmFactory not initialized yet');
        }

        // 使用默认的第一个数据库
        const className = entity.name;

        // 如果 entity 分库了，则需要根据 shardId 来获取对应的 connection
        if (entity.prototype.shardId && this._entityConn.hasOwnProperty(className) && this._entityConn[className].length > 1) {
            return this.getDataSource(this._entityConn[className][entity.prototype.shardId]);
        }

        // 如果 entity 是否配置了 DbType
        const {DbType} = OrmEntityStorage.instance.get(className);
        if (DbType) {
            return this.getDataSource(this._dbConfig[DbType][0].database);
        }

        // 默认返回第一个数据库
        return this.getDataSource(this._dbConfig[Object.keys(this._dbConfig)[0]][0].database);
    }

    /**
     * 每个 entityClass 都可能存放在不同的 connection option 中
     *
     * @param {string} className
     * @param {string} connectionName
     * @return void
     * @private
     */
    private _saveEntityConn(className: string, connectionName: any): void {
        if (!this._entityConn.hasOwnProperty(className)) {
            this._entityConn[className] = [];
        }
        this._entityConn[className].push(String(connectionName));
    }

    /**
     * 每个 entityClass 都可能存放在不同的 connection option 中
     *
     * @param {string} entityClassName
     * @param {string} className
     * @param {string} classPath
     * @return void
     * @private
     */
    private _saveEntityInfo(entityClassName: string, className: string, classPath: string): void {
        if (!this._entityInfo.hasOwnProperty(entityClassName)) {
            this._entityInfo[entityClassName] = [];
        }
        this._entityInfo[entityClassName].push({
            shardClassName: className,
            shardClassPath: classPath
        });
    }

    /**
     * 每个 entityClass 都可能存放在不同的 connection option 中
     *
     * @param {string} className
     * @param {string} classPath
     * @return void
     * @private
     */
    private _saveEntityMap(className: string, classPath: string): void {
        if (this._entityMap[className]) {
            return;
        }

        // 预先加载是在项目启动时，如果没有加载到应该直接报错
        this._entityMap[className] = require(classPath)[className];
        if (!this._entityMap[className]) {
            throw new ErrorMessage(10036, className);
        }
    }

    /**
     * 获取 Entity 实例
     *
     * @param {EntityClass} entity
     * @param {string | number} shardColumnValue
     * @return {EntityClass}
     */
    public getEntity<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardColumnValue: string | number = 0
    ): EntityClass<T> {
        if (!this._initialized) {
            throw new ErrorMessage(10000, 'OrmFactory not initialized yet');
        }

        // 如果已经分片过，则直接返回当前的 entity
        const className = entity.name;
        if ((className.indexOf('_') != -1) && typeof (entity) == 'function') {
            return entity as any;
        }

        // 没有找到 Entity
        const {ShardTable} = OrmEntityStorage.instance.get(className);
        if (!this._entityConn.hasOwnProperty(className) || !this._entityInfo.hasOwnProperty(className)) {
            throw new ErrorMessage(10034, className);
        }

        // 根据分库数量，获取分库的分片 id
        const tableShardId = ShardingTools.getShardId({count: ShardTable, value: shardColumnValue});

        // 查找 className 对应的分片表的信息
        const shardEntityInfo = this._entityInfo[className][tableShardId];
        if (!shardEntityInfo) {
            throw new ErrorMessage(10035, className);
        }
        // 查找 className 和 tableShardId 对应的 Entity 实例
        const shardEntity = this._entityMap[shardEntityInfo.shardClassName];
        if (!shardEntity) {
            throw new ErrorMessage(10036, shardEntityInfo.shardClassName);
        }

        // 将数据库分片 ID 加入到原型链
        shardEntity.prototype.shardId = ShardingTools.getShardId({
            count: this._entityConn[className].length,
            value: shardColumnValue,
            algorithm: 'hash'
        });

        // 加载 Entity File
        return shardEntity;
    }

    /**
     * 创建一个 entity 实例
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {Object} data
     * @param {boolean} hasEntityShard
     * @return {T extends BaseOrmEntity}
     */
    public static createEntity<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        data?: Object,
        hasEntityShard: boolean = false
    ): T {
        // 如果尚未分片，需要进行一次分片
        const targetEntity = (hasEntityShard) ? entity : OrmFactory.instance().getEntity(entity, shardValue);
        const entityInstance = (targetEntity as any).create();
        return (data) ? Object.assign(entityInstance, data) : entityInstance;
    }

    /**
     * 搜索 EntityVo
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @return {Promise<T extends BaseOrmEntity>}
     */
    public static async findVo<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue?: string | number
    ): Promise<T> {
        // 需要先根据传入的 Entity 进行一次分片，防止数据库 table_name 丢失
        const target = OrmFactory.instance().getEntity(entity, shardValue);
        const {HaveRowList} = OrmEntityStorage.instance.get(target.name);

        // 参数验证
        if (HaveRowList && (!shardValue || !indexValue)) {
            throw new ErrorMessage(10033, target.name);
        }

        if (!indexValue) {
            indexValue = shardValue;
        }

        // 缓存命中，需要将 data 封装成 entity 再返回
        const cacheEntity = await this.getVoCache<T>(target, shardValue, indexValue);

        // 缓存未命中，数据库命中，将数据塞入缓存，并返回 entity
        if (!cacheEntity) {
            const dataList = await this.select<T>(target, shardValue, indexValue);
            if (dataList && dataList.length > 0) {
                // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
                const entityVoList = this._coverRowListToEntityList<T>(target, dataList);
                const entityVo = entityVoList[indexValue];
                await this.setVoCache<T>(target, shardValue, indexValue, entityVo);

                // 仅在有缓存索引的情况下才更新缓存索引，如果缓存索引不存在，等下次数据库查询时更新全量的缓存索引。因为没有索引的情况下插入索引，会导致缓存不一致。
                // 缓存索引不存在的情况：
                //    情况1: 缓存索引到期失效
                //    情况2: 缓存索引被误删除（不考虑手动删除某一条缓存索引的情况）
                if ((await this.getVoIndexCache(entity, shardValue)).length > 0) {
                    await this.setVoListIndexCache<T>(target, shardValue, String(indexValue));
                }

                return entityVo;
            }
        }

        return cacheEntity;
    }

    /**
     * 获取 EntityVo
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @return {Promise<T extends BaseOrmEntity>}
     */
    public static async getVo<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue?: string | number
    ): Promise<T> {
        // 需要先根据传入的 Entity 进行一次分片，防止数据库 table_name 丢失
        const target = OrmFactory.instance().getEntity(entity, shardValue);
        const {HaveRowList} = OrmEntityStorage.instance.get(target.name);

        // 参数验证
        if (HaveRowList && (!shardValue || !indexValue)) {
            throw new ErrorMessage(10033, target.name);
        }

        if (!indexValue) {
            indexValue = shardValue;
        }

        // 获取索引列表, 如果有索引列表，但是不包含当前的 indexValue，则直接返回 null
        const indexList = await this.getVoIndexCache<T>(target, shardValue);
        if (indexList.length > 0 && !indexList.includes(String(indexValue))) {
            return null;
        }

        // 缓存命中，需要将 data 封装成 entity 再返回
        const cacheEntity = await this.getVoCache<T>(target, shardValue, indexValue);

        // 缓存未命中，数据库命中，将数据塞入缓存，并返回 entity
        if (!cacheEntity) {
            const dataList = await this.select<T>(target, shardValue);
            if (dataList && dataList.length > 0) {
                // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
                const entityVoList = this._coverRowListToEntityList<T>(target, dataList);
                await this.setVoListCache<T>(target, shardValue, entityVoList);
                await this.setVoListIndexCache<T>(target, shardValue, Object.keys(entityVoList).map(String));
                return entityVoList[indexValue];
            }
        }

        return cacheEntity;
    }

    /**
     * 获取 EntityVoList
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @return {Promise<EntityVoList<T extends BaseOrmEntity>>}
     */
    public static async getVoList<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number
    ): Promise<EntityVoList<T>> {
        const target = OrmFactory.instance().getEntity(entity, shardValue);

        // TODO 现在 VO 和 VOLIST 的缓存格式统一了，不需要分开判断，类似 Order 这种只有也可以通过 shardValue 获取玩家全部订单。 
        // 参数验证
        // const { HaveRowList } = OrmEntityStorage.instance.get(target.name);
        // if (!HaveRowList) {
        //     throw new ErrorMessage(10032, target.name);
        // }

        // 缓存命中，需要将 data 封装成 entity[] 再返回
        const cacheVoList = await this.getVoListCache<T>(target, shardValue);

        // 缓存未命中，数据库命中，将数据塞入缓存，并返回 entity
        if (Object.keys(cacheVoList).length == 0) {
            const dataList = await this.select<T>(target, shardValue);
            if (dataList && dataList.length > 0) {
                // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
                const entityVoList = this._coverRowListToEntityList<T>(target, dataList);
                await this.setVoListCache<T>(target, shardValue, entityVoList);
                await this.setVoListIndexCache<T>(target, shardValue, Object.keys(entityVoList).map(String));
                return entityVoList;
            }
        }

        return cacheVoList;
    }

    /**
     * 将 数据库的 row 转换成以 indexColumn 为 Key 的 Map
     *
     * @param {EntityClass} entity
     * @param {any[]} dataList
     * @return {EntityVoList<Object>}
     * @private
     */
    private static _coverRowListToEntityList<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        dataList: any[]
    ): EntityVoList<T> {
        const {IndexColumn} = OrmEntityStorage.instance.get(entity.name);
        const list: EntityVoList<T> = {};
        dataList.forEach((data) => {
            if (data.hasOwnProperty(IndexColumn)) {
                list[data[IndexColumn]] = data;
            }
        });
        return list;
    }

    /**
     * 将 entity vo 保存到缓存
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @param {EntityVo<Object>} vo
     * @return {Promise<void>}
     * @private
     */
    public static async setVoCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue: string | number,
        vo: EntityVo<T>
    ): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).hSet(cacheKey, indexValue, vo);
    }

    /**
     * 将 entity voList 保存到缓存
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {EntityVoList<Object>} list
     * @return {Promise<void>}
     * @private
     */
    public static async setVoListCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        list: EntityVoList<T>
    ): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).hMSet(cacheKey, list);
    }

    /**
     * 将 entity voList 的 index 保存到缓存
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | string[]} list
     * @return {Promise<void>}
     * @private
     */
    public static async setVoListIndexCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        list: string | string[]
    ): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).sadd(cacheKey + INDEX_CACHE, list);
    }

    /**
     * 将 entity & entity list 从缓存中删除
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @return {Promise<void>}
     * @private
     */
    public static async removeCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number
    ): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).del(cacheKey);
    }

    /**
     * 将 entity vo 从缓存中删除
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @return {Promise<void>}
     * @private
     */
    public static async removeVoCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue: string | number
    ): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).hDel(cacheKey, String(indexValue));
    }

    /**
     * 将 entity vo 的 index 从缓存中删除
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @return {Promise<void>}
     * @private
     */
    public static async removeVoListIndexCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue: string | number
    ): Promise<void> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        await CacheFactory.instance().getCache(shardValue).srem(cacheKey + INDEX_CACHE, String(indexValue));
    }

    /**
     * 从缓存中获取 Vo 数据
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @return {Promise<T extends BaseOrmEntity>}
     * @private
     */
    public static async getVoCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue?: string | number
    ): Promise<T> {
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
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @return {Promise<EntityVoList<T extends BaseOrmEntity>>}
     * @private
     */
    public static async getVoListCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number
    ): Promise<EntityVoList<T>> {
        const list = {};
        const cache = CacheFactory.instance().getCache(shardValue);
        const cacheKey = this.cacheKey(entity.name, shardValue);

        // 1. 获取索引列表和缓存数据
        // 完全信任缓存索引，只有两种状态，一种是没有缓存，一种是全量缓存，当不存在缓存时，直接返回空列表，查询数据库后重建缓存
        const indexList = await cache.smembers(cacheKey + INDEX_CACHE);
        if (!indexList || indexList.length == 0) {
            return list;
        }

        // 2. 找出缺失的索引
        const cacheData = await cache.hGetAll(cacheKey) || {};
        const existingList = Object.keys(cacheData || {});
        const missingList = indexList.filter(index => !existingList.includes(index));
        const removeList = existingList.filter(index => !indexList.includes(index));

        // 3. 如果有已经删除的索引，直接删除缓存数据
        if (removeList.length > 0) {
            for (const key of Object.keys(removeList)) {
                await cache.hDel(cacheKey, key);
                delete cacheData[key];
            }
        }

        // 4. 如果没有缺失的索引，直接返回缓存数据
        if (missingList.length > 0) {
            const dataList = await this.select<T>(entity, shardValue, missingList);

            // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
            if (dataList && dataList.length > 0) {
                const entityVoList = this._coverRowListToEntityList<T>(entity, dataList);
                for (const key of Object.keys(entityVoList)) {
                    await cache.hSet(cacheKey, key, entityVoList[key]);
                    cacheData[key] = entityVoList[key];
                }
            }
        }

        for (const key of Object.keys(cacheData)) {
            list[key] = OrmFactory.createEntity(entity, shardValue, cacheData[key]);
        }

        return list;
    }


    /**
     * 从缓存中获取 VoList 的 index 数据
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @return {Promise<string[]>}
     * @private
     */
    public static async getVoIndexCache<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number
    ): Promise<string[]> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        return await CacheFactory.instance().getCache(shardValue).smembers(cacheKey + INDEX_CACHE);
    }

    /**
     * 数据库查询 select
     *
     * @param {EntityClass} entity
     * @param {number | string} shardValue
     * @param {number | string} indexValue
     * @return {Promise<<T extends BaseOrmEntity>[]>}
     * @private
     */
    public static select<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: number | string,
        indexValue?: number | string | number[] | string[]
    ): Promise<T[]> {
        const {ShardColumn, IndexColumn} = OrmEntityStorage.instance.get(entity.name);
        const condition = {};

        if (shardValue) {
            condition[ShardColumn] = shardValue;
        } else {
            throw new ErrorMessage(10031, entity.name);
        }

        if (indexValue && ShardColumn != IndexColumn) {
            if (Array.isArray(indexValue)) {
                condition[IndexColumn] = In(indexValue.map(String));
            } else {
                condition[IndexColumn] = indexValue;
            }
        }

        return (entity as any).find({
            where: condition
        });
    }

    /**
     * 生成 Cache Key
     *
     * @param {string} entityName
     * @param {string | number} shardValue
     * @private
     */
    private static cacheKey(
        entityName: string,
        shardValue: string | number
    ) {
        const entityInfo = OrmEntityStorage.instance.get(entityName);
        const cacheName = entityInfo.CacheName ? entityInfo.CacheName : entityName;
        return Utils.format('%s:%s', cacheName, shardValue);
    }
}
