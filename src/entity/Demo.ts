import {Column, Entity, PrimaryColumn} from 'typeorm';
import {CacheName, HaveRowList, IndexColumn, ShardColumn, ShardTable} from '../common/orm/OrmEntityStorage';
import {BaseOrmEntity} from '../common/orm/abstract/BaseOrmEntity';
import {serverConfig} from '../config/server.config';

@Entity('demo') // 定义表名
@CacheName(`${serverConfig.name}:demo`) // 定义缓存键
@ShardTable(10) // 定义分表数量
@ShardColumn('uid') // 定义数据分片字段
@IndexColumn('uid') // 定义缓存索引字段，通常是主键或索引或联合主键靠右那个
@HaveRowList(false) // 是否允许根据 shardColumn 查找多条记录

export class Demo extends BaseOrmEntity {
    @PrimaryColumn()
    uid: number;

    @Column()
    openId: string;

    @Column()
    name: string;

    @Column()
    createTime: number;

    @Column()
    loginTime: number;

    @Column()
    status: number;
}