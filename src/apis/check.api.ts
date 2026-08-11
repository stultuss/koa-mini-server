import joi from 'joi';
import {AbstractAPI, ApiContext, ApiNext, ApiRequest, METHOD_ALL} from '../lib/api/abstract/AbstractAPI';

class API extends AbstractAPI {

    constructor() {
        super();
        this.method = METHOD_ALL; // 'all' | 'post' | 'get'
        this.uri = '/check';
        this.type = 'application/json; charset=utf-8';
        this.schema = {
            opt: joi.string().optional(),
            productId: joi.number().optional()
        };
    }

    public async handle(ctx: ApiContext, req: ApiRequest, next: ApiNext): Promise<any> {
        const params = req.aggregatedParams;
    };
}

export default new API();
