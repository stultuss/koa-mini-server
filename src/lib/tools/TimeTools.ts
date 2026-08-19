import {Moment} from 'moment';

export class TimeTools {
    public static EMPTY: string = '0000-00-00 00:00:00';
    public static INIT: string = '1970-01-01 00:00:00';
    public static DEFAULT_TIMESTAMP: number = 1514736000;
    public static DURATION = {
        SECOND: 1,
        MINUTE: 60,
        MINUTES_5: 300,
        MINUTES_10: 600,
        MINUTES_30: 1800,
        HOUR: 3600,
        HOURS_4: 14400,
        HOURS_6: 21600,
        HOURS_8: 28800,
        HOURS_12: 43200,
        DAY: 86400,
        DAYS_2: 172800,
        DAYS_3: 259200,
        DAYS_7: 604800
    };

    /**
     * 将毫秒级时间戳转换为秒级时间戳。
     *
     * @param {number} timestamp - 待转换的时间戳，可能是毫秒级或秒级。
     * @returns {number} 返回转换后的秒级时间戳。
     */
    public static milliToSecond(timestamp: number): number {
        if (String(timestamp).length === 10) {
            return timestamp;
        }
        return timestamp ? Math.floor(timestamp / 1000) : 0;
    }

    /**
     * 将秒级时间戳转换为毫秒级时间戳。
     *
     * @param {number} timestamp - 待转换的时间戳，可能是秒级或毫秒级。
     * @returns {number} 返回转换后的毫秒级时间戳。
     */
    public static secondToMilli(timestamp: number): number {
        if (String(timestamp).length === 13) {
            return timestamp;
        }
        return timestamp ? Math.floor(timestamp * 1000) : 0;
    }

    /**
     * 将Excel中的日期数值转换为JavaScript的Date对象
     *
     * @param {string} val - Excel中的日期数值（字符串格式）
     * @returns {Date} 返回对应的JavaScript Date对象，如果输入为空则返回null
     */
    public static formatExcelTime(val: string): Date {
        if (!val || val == '') return null;
        const a = new Date(1900, 0, 0, 9, 0, 0).getTime();
        const b = (Number(val) - 1) * TimeTools.DURATION.DAY * 1000;
        return new Date(a + b);
    }

    /**
     * 根据传入的时间戳获取对应的 Date 对象
     *
     * @param {number} [timestamp] - 可选的时间戳，单位为秒。如果为 0，则使用默认时间戳 DEFAULT_TIMESTAMP；如果未传入，则使用当前时间。
     * @returns {Date} 返回对应的 Date 对象
     */
    public static getDate(timestamp?: number): Date {
        if (timestamp === 0) {
            timestamp = TimeTools.DEFAULT_TIMESTAMP;
        }
        if (timestamp) {
            return new Date(TimeTools.secondToMilli(timestamp));
        }
        return new Date();
    }

    /**
     * 获取指定时间戳对应的秒级时间戳。
     * 如果未传入时间戳，则返回当前时间的秒级时间戳。
     *
     * @param {number} [timestamp] - 可选参数，待处理的时间戳，单位可以是秒或毫秒。
     * @returns {number} 返回指定时间的秒级时间戳。
     */
    public static getTime(timestamp?: number): number {
        return this.getTimestamp(timestamp);
    }

    /**
     * 获取指定时间戳对应的秒级时间戳。
     * 如果未传入时间戳，则返回当前时间的秒级时间戳。
     *
     * @param {number} [timestamp] - 可选参数，待处理的时间戳，单位可以是秒或毫秒。
     * @returns {number} 返回指定时间的秒级时间戳。
     */
    public static getTimestamp(timestamp?: number): number {
        if (!timestamp) return Math.floor(Date.now() / 1000);
        return this.milliToSecond(timestamp);
    }

    /**
     * 获取指定时间戳对应的当天零点的秒级时间戳。
     * 如果未传入时间戳，则使用当前时间。
     *
     * @param {number} [timestamp] - 可选参数，待处理的时间戳，单位可以是秒或毫秒。
     * @returns {number} 返回指定时间当天零点的秒级时间戳。
     */
    public static getDayTime(timestamp?: number): number {
        const millisecond = TimeTools.secondToMilli(this.getTimestamp(timestamp));
        const date = TimeTools.getDate(millisecond);
        date.setHours(0, 0, 0, 0);
        return Math.floor(date.getTime() / 1000);
    }

    /**
     * 获取指定时间戳对应日期前一天零点的秒级时间戳。
     * 如果未传入时间戳，则使用当前时间进行计算。
     *
     * @param {number} [timestamp] - 可选参数，待处理的时间戳，单位可以是秒或毫秒。
     * @returns {number} 返回指定时间前一天零点的秒级时间戳。
     */
    public static getPrevDayTime(timestamp?: number): number {
        return TimeTools.getDayTime(timestamp) - TimeTools.DURATION.DAY;
    }

    /**
     * 获取指定时间戳对应日期下一天零点的秒级时间戳。
     * 如果未传入时间戳，则使用当前时间进行计算。
     *
     * @param {number} [timestamp] - 可选参数，待处理的时间戳，单位可以是秒或毫秒。
     * @returns {number} 返回指定时间下一天零点的秒级时间戳。
     */
    public static getNextDayTime(timestamp?: number): number {
        return TimeTools.getDayTime(timestamp) + TimeTools.DURATION.DAY;
    }

    /**
     * 获取指定时间戳对应日期下一天剩余的秒数。
     * 如果未传入时间戳，则使用当前时间进行计算。
     *
     * @param {number} [timestamp] - 可选参数，待处理的时间戳，单位可以是秒或毫秒。
     * @returns {number} 返回指定时间下一天剩余的秒数。
     */
    public static getNextDayRemainSecond(timestamp?: number): number {
        return TimeTools.getDayTime(timestamp) + TimeTools.DURATION.DAY - ((timestamp) ? timestamp : TimeTools.getTime());
    }

    /**
     * 计算从开始时间到目标时间的剩余秒数。
     *
     * @param {number} targetTime - 目标时间的时间戳，单位可以是秒或毫秒。
     * @param {number} [beginTime] - 可选参数，开始时间的时间戳，单位为秒。如果未传入，则使用当前时间。
     * @returns {number} 返回剩余秒数，如果目标时间早于开始时间，则返回 0。
     */
    public static getRemainSecond(targetTime: number, beginTime?: number): number {
        const target = TimeTools.milliToSecond(targetTime);
        const begin = beginTime || TimeTools.getTime();
        return (target < begin) ? 0 : target - begin;
    }

    /**
     * 计算从开始时间到指定时间内经过的冷却周期数。
     *
     * @param {number} time - 指定时间的时间戳，单位为秒。若传入 falsy 值，则使用当前时间。
     * @param {number} startTime - 开始时间的时间戳，单位为秒。
     * @param {number} coolDown - 冷却周期的时长，单位为秒。
     * @returns {number} 返回经过的冷却周期数，向下取整。
     */
    public static getCycleRound(time: number, startTime: number, coolDown: number): number {
        const curTime = time || TimeTools.getTime();
        return Math.floor((curTime - startTime) / coolDown);
    }

    /**
     * 计算指定时间所在冷却周期的开始时间。
     *
     * @param {number} time - 指定时间的时间戳，单位为秒。
     * @param {number} startTime - 冷却周期的起始时间戳，单位为秒。
     * @param {number} coolDown - 每个冷却周期的时长，单位为秒。
     * @returns {number} 返回指定时间所在冷却周期的开始时间戳。
     */
    public static getCycleRoundTime(time: number, startTime: number, coolDown: number): number {
        if (coolDown <= 0) {
            throw new Error('Cool down duration must be a positive number.');
        }
        return startTime + (TimeTools.getCycleRound(time, startTime, coolDown)) * coolDown;
    }

    /**
     * 计算指定时间之后下一个冷却周期的编号。
     *
     * @param {number} time - 指定时间的时间戳，单位为秒。若传入 falsy 值，则使用当前时间。
     * @param {number} startTime - 冷却周期的起始时间戳，单位为秒。
     * @param {number} coolDown - 每个冷却周期的时长，单位为秒。
     * @returns {number} 返回指定时间之后下一个冷却周期的编号。
     */
    public static getNextCycleRound(time: number, startTime: number, coolDown: number): number {
        return TimeTools.getCycleRound(time, startTime, coolDown) + 1;
    }

    /**
     * 计算指定时间之后下一个冷却周期的开始时间。
     *
     * @param {number} time - 指定时间的时间戳，单位为秒。
     * @param {number} startTime - 冷却周期的起始时间戳，单位为秒。
     * @param {number} coolDown - 每个冷却周期的时长，单位为秒。
     * @returns {number} 返回指定时间之后下一个冷却周期的开始时间戳。
     */
    public static getNextCycleRoundTime(time: number, startTime: number, coolDown: number): number {
        return TimeTools.getCycleRoundTime(time, startTime, coolDown) + coolDown;
    }

    /**
     * 将指定时区的时间转换为另一时区的时间
     *
     * @param {moment.Moment} time - 源时间
     * @param {string} fromTimezone - 源时区，如 8
     * @param {string} toTimezone - 目标时区，如 9
     * @returns {moment.Moment} 返回转换后的时间
     */
    public static convertTimezone(time: Moment, fromTimezone: number, toTimezone: number): Moment {
        return time.clone().add(toTimezone - fromTimezone, 'hour');
    }
}
