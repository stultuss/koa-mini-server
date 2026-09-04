/**
 * ORM 字段类型归一化工具
 *
 * TypeORM 的 save() 用实体字段值和数据库行做严格比较（compareIds：100 !== '100'），
 * 且缓存是 JSON 序列化，number/string 类型会被原样保存，而 MySQL 的 varchar 列返回字符串。
 * 为了保证实体字段与数据库返回类型一致，这里按列类型做转换：
 * - 字符串列收到 number/boolean/bigint → String(value)
 * - 整数列收到数字字符串 → Number(value)
 * - bigint/decimal 精度敏感、Date/对象等保持原样
 */
export class OrmTypeUtils {
    public static normalizeValue(type: any, value: any): any {
        if (value == null) return value;

        // @Column() 无显式类型时反射出来的是构造函数（String/Number），显式类型才是 'varchar' 等字符串
        const typeName = (typeof type === 'function') ? type.name.toLowerCase() : String(type).toLowerCase();

        // bigint/decimal 精度敏感，保持原样，不做类型转换
        if (typeName === 'bigint' || typeName === 'decimal') return value;

        const stringTypes = ['string', 'varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext', 'enum', 'set', 'date', 'datetime', 'timestamp'];
        const numberTypes = ['number', 'int', 'integer', 'tinyint', 'smallint', 'mediumint', 'year'];

        if (stringTypes.indexOf(typeName) !== -1 && (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')) {
            return String(value);
        }
        if (numberTypes.indexOf(typeName) !== -1 && typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) {
            return Number(value);
        }
        return value;
    }
}
