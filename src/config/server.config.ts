export interface IServerConfig {
    env: string,
    name: string,
    host: string,
    port: number
}

export const serverConfig: IServerConfig = {
    env: (process.env.NODE_ENV) ? process.env.NODE_ENV : 'development',
    name: 'KoaMiniServer',
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 8080
};