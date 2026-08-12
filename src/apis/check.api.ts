import {AbstractAPI, ApiContext, ApiNext, ApiRequest, METHOD_ALL} from '../lib/api/abstract/AbstractAPI';
import {TimeTools} from '../lib/tools/TimeTools';
import {OrmFactory} from '../lib/orm/OrmFactory.class';
import {CacheFactory} from '../lib/cache/CacheFactory.class';
import {Logs} from '../entity/Logs';
import {LogsModel} from '../models/logs.model';

class API extends AbstractAPI {

    constructor() {
        super();
        this.method = METHOD_ALL; // 'all' | 'post' | 'get'
        this.uri = '/check';
        this.type = 'application/json; charset=utf-8';
        this.schema = {};
    }

    public async handle(ctx: ApiContext, req: ApiRequest, next: ApiNext): Promise<any> {
        const params = req.aggregatedParams || {};
        if (params.test == 'log') {
            return await this._testLog();
        }
        return {
            status: 'ok',
            time: TimeTools.getTime()
        };
    };

    /**
     * 测试 Logs（HaveRowList=true）的列表缓存：插入多条 -> 读列表 -> 再插入看是否增量更新
     *
     * @return {Promise<Object>}
     * @private
     */
    private async _testLog(): Promise<any> {
        const uid = 900001;
        const cacheKey = `KoaMiniServer:logs:${uid}`;
        const conn = OrmFactory.instance().getConnection(Logs);
        const repository = conn.getRepository(Logs);

        // 清理历史测试数据与缓存
        await repository.delete({uid});
        const cache = CacheFactory.instance().getCache(uid);
        await cache.del(cacheKey);
        await cache.del(cacheKey + ':index');
        await cache.del(cacheKey + ':ver');

        // 插入 3 条日志
        const now = TimeTools.getTime();
        for (let i = 1; i <= 3; i++) {
            const log = new Logs();
            log.uid = uid;
            log.type = 1;
            log.count = i;
            log.remain = i;
            log.memo = 'm' + i;
            log.time = now + i;
            await log.insert();
        }

        // 读列表（新实例，避免命中模型内存缓存）
        const list = await new LogsModel(String(uid)).get();

        // 再插入第 4 条，看列表缓存是否增量更新
        const log4 = new Logs();
        log4.uid = uid;
        log4.type = 1;
        log4.count = 4;
        log4.remain = 4;
        log4.memo = 'm4';
        log4.time = now + 4;
        await log4.insert();
        const list2 = await new LogsModel(String(uid)).get();

        const dbCount = await repository.count({where: {uid}});
        const hash = await cache.hGetAll(cacheKey);
        const index = await cache.smembers(cacheKey + ':index');

        // 删除第一条，验证 index/hash 同步移除
        const firstId = Number(Object.keys(list2 || {})[0]);
        const row = await repository.findOneBy({id: firstId});
        await row.remove();
        const list3 = await new LogsModel(String(uid)).get();
        const index3 = await cache.smembers(cacheKey + ':index');

        // 更新一条 memo，验证缓存同步刷新
        const upd = await repository.findOneBy({id: Number(Object.keys(list3 || {})[0])});
        upd.memo = 'updated';
        await upd.save();
        const list4 = await new LogsModel(String(uid)).get();
        const updatedMemo = (list4 && list4[String(upd.id)]) ? list4[String(upd.id)].memo : null;

        return {
            test: 'log',
            uid,
            dbCount,
            listCount: (list) ? Object.keys(list).length : 0,
            listKeys: (list) ? Object.keys(list) : [],
            list2Count: (list2) ? Object.keys(list2).length : 0,
            cacheHashCount: (hash) ? Object.keys(hash).length : 0,
            cacheHashKeys: (hash) ? Object.keys(hash) : [],
            index,
            indexCount: (index) ? index.length : 0,
            version: await cache.getVersion(cacheKey + ':ver'),
            removedId: firstId,
            list3Count: (list3) ? Object.keys(list3).length : 0,
            index3Count: (index3) ? index3.length : 0,
            updatedMemo,
            list4Count: (list4) ? Object.keys(list4).length : 0
        };
    }
}

export default new API();
