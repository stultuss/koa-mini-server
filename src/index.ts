import server, {IConfigs} from './server';

// 获取配置
const configs: IConfigs = {
    server: require('../configs/server.json')
};

// 初始化服务器
server.init(configs).then(() => {
    // 启动服务器
    server.start();
}).catch((err) => {
    // 捕获启动报错
    console.log(err);
});