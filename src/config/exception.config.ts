export const ERROR_CODE = {
    0: 'SUCCEED',
    1: 'UNKNOWN, msg: %s',
    
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* 框架报错 10000 - 90000
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    /**
     * 默认报错
     */
    10000: '%s',
    10001: 'SYS_ERR, msg: %s',
    10002: 'PARAM_INVALID, msg: %s',
    10003: 'REDIS_CONNECT_ERR',
    10004: 'RATE_LIMIT_EXCEEDED, retryAfter: %s',
    10006: 'REQUEST_TIMEOUT, timeoutMs: %s',
    
    /**
     * 配置报错
     */
    10011: 'SETTING: Setting file not found! fileName: %s',
    10012: 'SETTING: Setting file or key not found! fileName: %s, key: %s',
    
    /**
     * 缓存报错
     */
    10021: 'CACHE: Cache type not found! type: %s',
    
    /**
     * 映射对象报错
     */
    10031: 'ORM: Primary Key value not exist! EntityClass: %s',
    10032: 'ORM: EntityClass is not a list! EntityClass: %s',
    10033: 'ORM: EntityClass is a list, need input indexValue! EntityClass: %s',
    10034: 'ORM: EntityClass not found! EntityClass: %s',
    10035: 'ORM: EntityClass info not found! EntityClass: %s',
    10036: 'ORM: EntityClass can\'t be require! EntityClass: %s',
    
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* 用户报错 20000 - 30000
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    20000: 'Signature error',
    20001: 'Signature has expired',
    20002: 'Permission denied',
    
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    //-* 业务报错 30001 - 30050
    //-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
    30000: 'Configuration not found',
    30001: 'Configuration value is not in JsonString format. value: %s',
    30002: 'Configuration has been locked.',
    
};
