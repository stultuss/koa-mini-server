"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const joi = require("@hapi/joi");
const AbstractBase_1 = require("../abstract/AbstractBase");
const ErrorFormat_1 = require("../../lib/Error/ErrorFormat");
class Demo extends AbstractBase_1.AbstractBase {
    constructor() {
        super();
        this.method = 'all'; // 'all' | 'post' | 'get'
        this.uri = '/v1/demo';
        this.type = 'application/json; charset=utf-8';
        this.schema = {
            name: joi.number().required()
        };
    }
    handle(ctx, req, next) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = req.aggregatedParams;
            if (1) {
                throw new ErrorFormat_1.ErrorFormat(20001, "default error message");
            }
            return params;
        });
    }
    ;
}
module.exports = new Demo();
