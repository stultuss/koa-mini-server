export interface IServerConfig {
    env: string,
    name: string,
    host: string,
    port: number,
    allowDomain: string[]
}

export const serverConfig: IServerConfig = {
    env: (process.env.NODE_ENV) ? process.env.NODE_ENV : 'development',
    name: 'demo',
    host: '0.0.0.0',
    port: 8080,
    allowDomain: []
};