"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverConfig = {
    env: (process.env.NODE_ENV) ? process.env.NODE_ENV : 'development',
    host: '0.0.0.0',
    port: 8080,
    allowDomain: []
};
