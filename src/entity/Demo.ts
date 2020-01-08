// import {Column, Entity, PrimaryColumn} from 'typeorm';
// import {CacheName, HaveRowList, IndexColumn, ShardColumn, ShardTable} from '../common/orm/OrmEntityStorage';
// import {BaseOrmEntity} from '../common/orm/abstract/BaseOrmEntity';
// import {gameName} from '../config/base.config';
//
// @Entity('user') // 定义表名
// @CacheName(`${gameName}:user`) // 定义缓存键
// @ShardTable(10) // 定义分表数量
// @ShardColumn('uid') // 定义数据分片字段
// @IndexColumn('uid') // 定义缓存索引字段，通常是主键或索引或联合主键靠右那个
// @HaveRowList(false) // 是否允许根据 shardColumn 查找多条记录
//
// export class Demo extends BaseOrmEntity {
//     @PrimaryColumn()
//     uid: number;
//
//     @Column()
//     openId: string;
//
//     @Column()
//     chatId: string;
//
//     @Column()
//     name: string;
//
//     @Column()
//     headImage: string;
//
//     @Column()
//     city: string;
//
//     @Column()
//     province: string;
//
//     @Column()
//     gender: number;
//
//     @Column()
//     focus: number;
//
//     @Column()
//     exp: number;
//
//     @Column()
//     level: number;
//
//     @Column()
//     bonusDiamond: number;
//
//     @Column()
//     purchasedDiamond: number;
//
//     @Column()
//     bonusGold: number;
//
//     @Column()
//     purchasedGold: number;
//
//     @Column()
//     dailyInfo: string;
//
//     public getDailyInfo(): {[key: string]: any} {
//         let data = {};
//         try {
//             data = JSON.parse(this.dailyInfo);
//         } catch (e) {
//             // do nothing
//         }
//         return data;
//     }
//
//     public setDailyInfo(data: {[key: string]: any}) {
//         try {
//             this.dailyInfo = JSON.stringify(data);
//         } catch (e) {
//             // do nothing
//         }
//     }
//
//     @Column()
//     extraInfo: string;
//
//     public getExtraInfo(): {[key: string]: any} {
//         let data = {};
//         try {
//             data = JSON.parse(this.extraInfo);
//         } catch (e) {
//             // do nothing
//         }
//         return data;
//     }
//
//     public setExtraInfo(data: {[key: string]: any}) {
//         try {
//             this.extraInfo = JSON.stringify(data);
//         } catch (e) {
//             // do nothing
//         }
//     }
//
//     @Column()
//     tags: number;
//
//     @Column()
//     guidance: number;
//
//     @Column()
//     inviteUid: number;
//
//     @Column()
//     createTime: number;
//
//     @Column()
//     clearTime: number;
//
//     @Column()
//     syncTime: number;
//
//     @Column()
//     lastLoginTime: number;
//
//     @Column()
//     status: number;
// }