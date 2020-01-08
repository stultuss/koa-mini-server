"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const LibPath = require("path");
exports.loggerConfig = {
    level: "debug" /* debug */,
    dir: LibPath.resolve(__dirname, '..', '..', 'logs'),
};
