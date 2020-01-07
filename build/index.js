"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
// 获取配置
const configs = {
    server: require('../configs/server.json')
};
// 初始化服务器
server_1.default.init(configs).then(() => {
    // 启动服务器
    server_1.default.start();
}).catch((err) => {
    // 捕获启动报错
    console.log(err);
});
