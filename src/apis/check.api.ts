import {AbstractAPI, ApiContext, ApiNext, ApiRequest, METHOD_ALL} from '../lib/api/abstract/AbstractAPI';
import {TimeTools} from '../lib/tools/TimeTools';

class API extends AbstractAPI {

    constructor() {
        super();
        this.method = METHOD_ALL; // 'all' | 'post' | 'get'
        this.uri = '/check';
        this.type = 'application/json; charset=utf-8';
        this.schema = {};
    }

    public async handle(ctx: ApiContext, req: ApiRequest, next: ApiNext): Promise<any> {
        return {
            status: 'ok',
            time: TimeTools.getTime()
        };
    };
}

export default new API();
