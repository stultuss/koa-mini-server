export class FlexibleMap extends Map {
    #normalize(key: any): any {
        // 保留对象引用（对象只能用对象本身取），仅对原始值做标准化
        if (key === null || key === undefined) return key;
        if (typeof key === 'object' || typeof key === 'function') return key;
        // 核心：将 number/string/boolean/bigint 统一转为 string
        return String(key);
    }

    constructor(iterable?: Iterable<[any, any]>) {
        super();
        // Map 构造函数内部会调用子类重写的 set，此时私有方法 #normalize 尚未就绪，
        // 会触发 "Receiver must be an instance of class FlexibleMap"，所以这里手动填充
        if (iterable) {
            for (const [key, value] of iterable) {
                this.set(key, value);
            }
        }
    }

    set(key: any, value: any) {
        return super.set(this.#normalize(key), value);
    }

    get(key: any) {
        return super.get(this.#normalize(key));
    }

    has(key: any) {
        return super.has(this.#normalize(key));
    }

    delete(key: any) {
        return super.delete(this.#normalize(key));
    }
}
