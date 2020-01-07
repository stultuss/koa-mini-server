"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Utility_1 = require("../Utility");
const ErrorCode_1 = require("../Const/ErrorCode");
class ErrorFormat extends Error {
    constructor(code, ...argus) {
        super();
        this.code = code;
        this.message = this.getExMsg(argus);
    }
    getExMsg(argus) {
        return Utility_1.CommonTools.format((ErrorCode_1.ERROR_CODE.hasOwnProperty(this.code) ? ErrorCode_1.ERROR_CODE[this.code] : '%s'), ...argus);
    }
}
exports.ErrorFormat = ErrorFormat;
