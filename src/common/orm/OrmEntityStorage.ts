export const STORAGE_NAME_SHARD_TABLE = 'ShardTable';
export const STORAGE_NAME_SHARD_COLUMN = 'ShardColumn';
export const STORAGE_NAME_INDEX_COLUMN = 'IndexColumn';
export const STORAGE_NAME_HAVE_ROW_LIST = 'HaveRowList';
export const STORAGE_NAME_CACHE_NAME = 'CacheName';

export interface StorageType {
    ShardTable?: number,
    ShardColumn?: number,
    IndexColumn?: number,
    HaveRowList?: boolean,
    CacheName?: string,
}

export class OrmEntityStorage {
    private static _instance: OrmEntityStorage;

    private _argsMap: Map<string, StorageType> = new Map<string, StorageType>();

    static get instance(): OrmEntityStorage {
        if (this._instance == undefined) {
            this._instance = new OrmEntityStorage();
        }
        return this._instance;
    }

    public set(className: string, name: string, value: any): void {
        if (!this._argsMap.has(className)) {
            this._argsMap.set(className, {});
        }
        let storageTypes = this._argsMap.get(className);
        storageTypes[name] = value;
        this._argsMap.set(className, storageTypes);
    }

    public get(className: string): StorageType {
        if (!this._argsMap.has(className)) {
            return null
        }
        return this._argsMap.get(className);
    }

    public add(className: string, value: StorageType): void {
        if (!this._argsMap.has(className)) {
            this._argsMap.set(className, value);
        }
    }
}

// ShardTable
export function ShardTable(shardCount: number = 1): Function {
    return (target: any) => {
        OrmEntityStorage.instance.set(target.name, STORAGE_NAME_SHARD_TABLE, shardCount);
    };
}

// ShardColumn
export function ShardColumn(columnName: string): Function {
    return (target: any) => {
        OrmEntityStorage.instance.set(target.name, STORAGE_NAME_SHARD_COLUMN, columnName);
    };
}

// IndexColumn
export function IndexColumn(columnName: string): Function {
    return (target: any) => {
        OrmEntityStorage.instance.set(target.name, STORAGE_NAME_INDEX_COLUMN, columnName);
    };
}

// HaveRowList
export function HaveRowList(isList: boolean = true): Function {
    return (target: any) => {
        OrmEntityStorage.instance.set(target.name, STORAGE_NAME_HAVE_ROW_LIST, isList);
    };
}

// CacheName
export function CacheName(cacheName: string = null): Function {
    return (target: any) => {
        OrmEntityStorage.instance.set(target.name, STORAGE_NAME_CACHE_NAME, cacheName);
    };
}