import * as fsp from 'fs/promises';
import * as path from 'path';
import {DataSource, DataSourceOptions, In, ObjectType, Raw} from 'typeorm';
import {FileTools} from '../tools/FileTools';
import {ErrorMessage} from '../exception/ErrorMessage';
import {CacheFactory} from '../cache/CacheFactory.class';
import {ShardingTools} from '../tools/ShardingTools';
import {BaseOrmEntity} from './abstract/BaseOrmEntity';
import {OrmEntityStorage} from './OrmEntityStorage';
import {OrmUtils} from './utils/OrmUtils';
import {OrmTypeUtils} from './utils/OrmTypeUtils';
import {Logger} from '../Logger';
import {Utils} from '../Utils';

export type EntityVo<T extends BaseOrmEntity> = T;
export type EntityVoList<T extends BaseOrmEntity> = { [key: string]: EntityVo<T> }; // 一般是 shardColumn 或 indexColumn
export type EntityClass<T extends BaseOrmEntity> = ObjectType<T>;

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
                // 同一个 config key 下的多个数据源共享同一份 entity 文件（分库场景），
                // 只有跨 config key 重复才属于配置错误
                if (seen.has(glob) && seen.get(glob) !== key) {
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
                // 同一库名可能被多个配置分组引用（如 demo 与 read_demo 指向同一库），
                // 以 "分组:库名" 唯一存储，避免后初始化分组覆盖前面分组的实体元数据
                this._dataSources[`${key}:${config.database}`] = dataSource;
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
        if (name == null) {
            return undefined;
        }

        const key = String(name);

        // 直接命中（支持 "分组:库名" 组合键）
        if (this._dataSources[key]) {
            return this._dataSources[key];
        }

        // 按配置分组名取该组第一个数据源（如 read_demo）
        if (this._dbConfig[key] && this._dbConfig[key].length > 0) {
            return this._dataSources[`${key}:${this._dbConfig[key][0].database}`];
        }

        // 兼容旧的“库名”寻址：默认取第一个配置分组（demo）中同名库的连接
        const firstKey = Object.keys(this._dbConfig)[0];
        return this._dataSources[`${firstKey}:${key}`];
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
            return this.getDataSource(`${DbType}:${this._dbConfig[DbType][0].database}`);
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
        if (data) {
            Object.assign(entityInstance, data);
            // 读取侧归一化：按列类型转换字段值，兼容历史脏缓存（缓存 number / 数据库 string 等）
            const metadata = OrmFactory.instance().getConnection(targetEntity).getMetadata(targetEntity);
            for (const column of metadata.columns) {
                const value = column.getEntityValue(entityInstance);
                const normalized = OrmTypeUtils.normalizeValue(column.type, value);
                if (normalized !== value) {
                    column.setEntityValue(entityInstance, normalized);
                }
            }
        }
        return entityInstance;
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
        const {ShardColumn, IndexColumn, HaveRowList} = OrmEntityStorage.instance.get(target.name);

        // 参数验证
        if (HaveRowList && (!shardValue || !indexValue)) {
            throw new ErrorMessage(10033, target.name);
        }

        if (!indexValue) {
            // ShardColumn != IndexColumn 的实体（联合主键，如 OpenBind* 系列）：按分片字段可能匹配多行，
            // indexValue 缺省时无法确定唯一行。fallback 用 shardValue 会导致缓存 field 错位
            // （恒 miss）且取值恒 undefined，这里直接按 list 语义报 10033，强制传入 indexValue。
            if (ShardColumn != IndexColumn) {
                throw new ErrorMessage(10033, target.name);
            }
            indexValue = shardValue;
        }

        // 缓存命中，需要将 data 封装成 entity 再返回
        const cacheEntity = await this.getVoCache<T>(target, shardValue, indexValue);

        // 缓存未命中，数据库命中，将数据塞入缓存，并返回 entity
        if (!cacheEntity) {
            // 读取前记录版本号，写回时做 CAS，防止并发写把旧值覆盖成新值后又把旧缓存写回
            const version = await this.getVoVersion<T>(target, shardValue);

            const dataList = await this.select<T>(target, shardValue, indexValue);
            if (dataList && dataList.length > 0) {
                // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
                const entityVoList = this._coverRowListToEntityList<T>(target, dataList);
                const entityVo = entityVoList[indexValue];
                await this.setVoCacheIfVersion<T>(target, shardValue, indexValue, entityVo, version);

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
     * @param {boolean} isLower
     * @return {Promise<T extends BaseOrmEntity>}
     */
    public static async getVo<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue?: string | number,
        isLower: boolean = false
    ): Promise<T> {
        // 需要先根据传入的 Entity 进行一次分片，防止数据库 table_name 丢失
        const target = OrmFactory.instance().getEntity(entity, shardValue);
        const {ShardColumn, IndexColumn, HaveRowList} = OrmEntityStorage.instance.get(target.name);

        // 参数验证
        if (HaveRowList && (!shardValue || !indexValue)) {
            throw new ErrorMessage(10033, target.name);
        }

        if (!indexValue) {
            // ShardColumn != IndexColumn 的实体（联合主键，如 OpenBind* 系列）：按分片字段可能匹配多行，
            // indexValue 缺省时无法确定唯一行。fallback 用 shardValue 会导致缓存 field 错位
            // （恒 miss）且取值恒 undefined，这里直接按 list 语义报 10033，强制传入 indexValue。
            if (ShardColumn != IndexColumn) {
                throw new ErrorMessage(10033, target.name);
            }
            indexValue = shardValue;
        }

        // 大小写不敏感场景（如邮箱）：缓存字段名统一小写，与 _coverRowListToEntityList 写入保持一致
        const cacheIndex = (isLower) ? String(indexValue).toLowerCase() : indexValue;

        // 缓存命中，需要将 data 封装成 entity 再返回
        const cacheEntity = await this.getVoCache<T>(target, shardValue, cacheIndex);

        // 缓存未命中，数据库命中，将数据塞入缓存，并返回 entity
        if (!cacheEntity) {
            // 读取前记录版本号，写回时做 CAS，防止并发写把旧值覆盖成新值后又把旧缓存写回
            const version = await this.getVoVersion<T>(target, shardValue);

            const dataList = await this.select<T>(target, shardValue, null, isLower);
            if (dataList && dataList.length > 0) {
                // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
                const entityVoList = this._coverRowListToEntityList<T>(target, dataList, isLower);
                await this.setVoListCacheIfVersion<T>(target, shardValue, entityVoList, version);
                return entityVoList[(isLower) ? String(indexValue).toLowerCase() : indexValue];
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
            // 读取前记录版本号，写回时做 CAS，防止并发写把旧值覆盖成新值后又把旧缓存写回
            const version = await this.getVoVersion<T>(target, shardValue);

            const dataList = await this.select<T>(target, shardValue);
            if (dataList && dataList.length > 0) {
                // 将数据库结果转成以 indexColumn 为 key 的 k-v 对象，通过 hMSet 塞回缓存
                const entityVoList = this._coverRowListToEntityList<T>(target, dataList);
                await this.setVoListCacheIfVersion<T>(target, shardValue, entityVoList, version);
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
     * @param {boolean} isLower
     * @return {EntityVoList<Object>}
     * @private
     */
    private static _coverRowListToEntityList<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        dataList: any[],
        isLower: boolean = false
    ): EntityVoList<T> {
        const {IndexColumn} = OrmEntityStorage.instance.get(entity.name);
        const list: EntityVoList<T> = {};
        dataList.forEach((data) => {
            if (data.hasOwnProperty(IndexColumn)) {
                const key = (isLower) ? String(data[IndexColumn]).toLowerCase() : data[IndexColumn];
                list[key] = data;
            }
        });
        return list;
    }

    /**
     * 获取缓存版本号
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @return {Promise<number>}
     * @private
     */
    public static async getVoVersion<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number
    ): Promise<number> {
        const versionKey = this.versionKey(entity.name, shardValue);
        return await CacheFactory.instance().getCache(shardValue).getVersion(versionKey);
    }

    /**
     * 缓存版本号 +1（写操作后调用，使在途读请求的 CAS 失败）
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @return {Promise<number>}
     * @private
     */
    public static async incrVoVersion<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number
    ): Promise<number> {
        const versionKey = this.versionKey(entity.name, shardValue);
        return await CacheFactory.instance().getCache(shardValue).incrVersion(versionKey);
    }

    /**
     * 版本号匹配才写入单个 entity vo（Lua CAS）
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {string | number} indexValue
     * @param {EntityVo<Object>} vo
     * @param {number | string} expectedVersion
     * @return {Promise<boolean>}
     * @private
     */
    public static async setVoCacheIfVersion<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        indexValue: string | number,
        vo: EntityVo<T>,
        expectedVersion: number | string
    ): Promise<boolean> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        const versionKey = this.versionKey(entity.name, shardValue);
        return await CacheFactory.instance().getCache(shardValue).hSetIfVersion(cacheKey, indexValue, vo, versionKey, expectedVersion);
    }

    /**
     * 将 entity vo 直接写入缓存（写库提交后由写者写入；并发写同分片不同行时字段互不冲突，无需 CAS）
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
     * 版本号匹配才批量写入 entity voList（Lua CAS）
     *
     * @param {EntityClass} entity
     * @param {string | number} shardValue
     * @param {EntityVoList<Object>} list
     * @param {number | string} expectedVersion
     * @return {Promise<boolean>}
     * @private
     */
    public static async setVoListCacheIfVersion<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: string | number,
        list: EntityVoList<T>,
        expectedVersion: number | string
    ): Promise<boolean> {
        const cacheKey = this.cacheKey(entity.name, shardValue);
        const versionKey = this.versionKey(entity.name, shardValue);
        return await CacheFactory.instance().getCache(shardValue).hMSetIfVersion(cacheKey, list, versionKey, expectedVersion);
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

        // CAS 模式下缓存不删，hash 非空即完整；为空则回源全量重建（getVoList 兜底）
        const cacheData = await cache.hGetAll(cacheKey);
        if (!cacheData) {
            return list;
        }

        for (const key of Object.keys(cacheData)) {
            list[key] = OrmFactory.createEntity(entity, shardValue, cacheData[key]);
        }

        return list;
    }

    /**
     * 数据库查询 select
     *
     * @param {EntityClass} entity
     * @param {number | string} shardValue
     * @param {number | string} indexValue
     * @param {boolean} isLower
     * @return {Promise<<T extends BaseOrmEntity>[]>}
     * @private
     */
    public static select<T extends BaseOrmEntity>(
        entity: EntityClass<T>,
        shardValue: number | string,
        indexValue?: number | string | number[] | string[],
        isLower: boolean = false
    ): Promise<T[]> {
        const {ShardColumn, IndexColumn} = OrmEntityStorage.instance.get(entity.name);
        const condition = {};

        if (shardValue) {
            condition[ShardColumn] = LowerCaseRaw(shardValue, isLower);
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
        // {shardValue} 为 Redis 集群 hash tag：数据 Key 与版本 Key（cacheKey + ':ver'）
        // 必须落在同一 slot，集群版才允许在一次 EVAL（Lua CAS）里同时访问（禁止跨 slot 脚本）。
        return Utils.format('%s:{%s}', cacheName, shardValue);
    }

    /**
     * 生成缓存版本 Key（与数据 Key 一一对应，用于 CAS 写）
     *
     * @param {string} entityName
     * @param {string | number} shardValue
     * @return {string}
     * @private
     */
    private static versionKey(entityName: string, shardValue: string | number): string {
        return this.cacheKey(entityName, shardValue) + ':ver';
    }
}

/**
 * 大小写不敏感条件：LOWER(列) = LOWER(:val)，用于邮箱等需要忽略大小写匹配的字段
 *
 * @param {any} val
 * @param {boolean} isLower
 * @return {any}
 */
function LowerCaseRaw(val: any, isLower: boolean = false): any {
    return isLower ? Raw((alias) => `LOWER(${alias}) = LOWER(:val)`, {val: val}) : val;
}
