import server from './server';


// 初始化服务器
server.init().then(() => {
    // 启动服务器
    server.start();
}).catch((err) => {
    // 捕获启动报错
    console.log(err);
});