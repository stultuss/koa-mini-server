export const ERROR_CODE = {
    0: 'SUCCEED',
    1: 'UNKNOWN, msg: %s',
    
    /**
     * 100000 ～ 100099 Default，系统错误
     */
    100000: '%s',
    100001: 'SYS_ERR, msg: %s',
    100002: 'PARAM_INVALID, msg: %s',
    100003: 'REDIS_CONNECT_ERR',
    
    /**
     * 300001 ~ 300010 Config，系统错误
     */
    300001: '[Config] Config file not found! configName: %s',
    300002: '[Config] Config file or key not found! configName: %s, key: %s',
    
    /**
     * 700001 ~ 700100 SYSTEM，系统错误
     */
    700001: '[Cache] Cache type not found! type: %s',
    700010: '[Cache] You can\'t use this command in current env！env: %s, command: %s',
    700011: '[Cache] You can\'t use redis.keys() with "*" pattern！pattern: %s',
    
    /**
     * 700101 ~ 700200 ORM，系统错误
     */
    700101: '[Orm] Primary Key value not exist! EntityClass: %s',
    700102: '[Orm] EntityClass is not a list! EntityClass: %s',
    700103: '[Orm] EntityClass is a list, need input indexValue! EntityClass: %s',
    700104: '[Orm] EntityClass not found! EntityClass: %s',
    700105: '[Orm] EntityClass info not found! EntityClass: %s',
    700106: '[Orm] EntityClass can\'t be require! EntityClass: %s',
    
};