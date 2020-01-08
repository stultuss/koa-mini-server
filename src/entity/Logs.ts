// import {Column, Entity, PrimaryColumn} from 'typeorm';
// import {CacheName, HaveRowList, IndexColumn, ShardColumn, ShardTable} from '../common/orm/OrmEntityStorage';
// import {BaseOrmEntity} from '../common/orm/abstract/BaseOrmEntity';
// import {gameName} from '../config/base.config';
//
// @Entity('formId_table') // 定义表名
// @CacheName(`${gameName}:formId_table`) // 定义缓存键
// @ShardTable(1) // 定义分表数量
// @ShardColumn('userId') // 定义数据分片字段
// @IndexColumn('formId') // 定义缓存索引字段，通常是主键或索引或联合主键靠右那个
// @HaveRowList(true) // 是否允许根据 shardColumn 查找多条记录
//
// export class Logs extends BaseOrmEntity {
//     @PrimaryColumn()
//     userId: number;
//
//     @PrimaryColumn()
//     formId: string;
//
//     @Column()
//     openId: string;
//
//     @Column()
//     expireTime: number;
// }