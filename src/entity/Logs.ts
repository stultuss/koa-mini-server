import {Column, Entity, PrimaryColumn, PrimaryGeneratedColumn} from 'typeorm';
import {CacheName, HaveRowList, IndexColumn, ShardColumn, ShardTable} from '../common/orm/OrmEntityStorage';
import {BaseOrmEntity} from '../common/orm/abstract/BaseOrmEntity';
import {serverConfig} from '../config/server.config';

@Entity('logs') // 定义表名
@CacheName(`${serverConfig.name}:logs`) // 定义缓存键
@ShardTable(1) // 定义分表数量
@ShardColumn('id') // 定义数据分片字段
@IndexColumn('id') // 定义缓存索引字段，通常是主键或索引或联合主键靠右那个
@HaveRowList(false) // 是否允许根据 shardColumn 查找多条记录

export class Logs extends BaseOrmEntity {
    @PrimaryGeneratedColumn()
    id: number;
    
    @PrimaryColumn()
    uid: number;
    
    @Column()
    type: number;
    
    @Column()
    count: number;
    
    @Column()
    remain: number;
    
    @Column()
    memo: string;
    
    @Column()
    time: number;
}