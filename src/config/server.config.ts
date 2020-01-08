export interface IServerConfig {
    env: string,
    host: string,
    port: number,
    allowDomain: string[]
}

export const serverConfig: IServerConfig = {
    env: (process.env.NODE_ENV) ? process.env.NODE_ENV : 'development',
    host: '0.0.0.0',
    port: 8080,
    allowDomain: []
};