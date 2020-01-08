export interface IServerConfig {
    host: string,
    port: number,
    allowDomain: string[]
}

export const serverConfig: IServerConfig = {
    host: '0.0.0.0',
    port: 8080,
    allowDomain: []
};