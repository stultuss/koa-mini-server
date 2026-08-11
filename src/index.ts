import server from './server';

// 初始化服务器
server.init().then(() => {
    // 启动服务器
    server.start();
}).catch((err) => {
    // 捕获启动报错
    console.log(err);
    process.exit(-1);
});

process.on('uncaughtException', (err) => {
    console.error(`process on uncaughtException error = ${err}`);
    // 未捕获异常（如端口被占 EADDRINUSE）时直接退出，避免进程假活（无监听但存活）
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error(`process on unhandledRejection error = ${err}`);
});

process.on('SIGINT', () => {
    console.warn('process shutdown by SIGINT');
    process.exit(0);
});
