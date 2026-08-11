import * as util from 'util';
import { ERROR_CODE } from '../../config/exception.config';
import { serverConfig } from '../../config/server.config';

export interface ErrorResponse {
  code: number;
  msg: string;
  stack?: string;  // 开发环境显示堆栈
}

export class ErrorMessage extends Error {
  public code: number;
  public message: string;

  /**
   * 构造函数，将异常数据从 Exception 格式转换为 Error 格式。
   *
   * @param {number} code - 错误代码，用于标识错误类型。
   * @param {...any} args - 格式化错误消息时使用的参数，默认为 null，表示未提供参数。
   */
  constructor(code: number, ...args: any) {
    super();
    this.code = code;

    // 使用可选链操作符优化代码
    const template = ERROR_CODE[code] ?? '%s';
    this.message = args.length ? util.format(template, ...args) : template;
  }

  /**
   * 处理不同类型的错误，并将其转换为统一的 ApiError 格式。
   *
   * 此方法接受不同类型的错误输入，包括 ErrorMessage 实例、数字、Error 实例或字符串，
   * 并根据错误类型设置 ApiError 对象的 code 和 msg 属性。在开发环境下，还会包含错误堆栈信息。
   *
   * @param {Error | ErrorMessage | number | string} error - 要处理的错误，可以是 ErrorMessage 实例、数字、Error 实例或字符串。
   * @returns {ErrorResponse} - 返回一个包含错误代码和消息的 ApiError 对象。
   */
  static format(error: Error | ErrorMessage | number | string): ErrorResponse {
    const response: ErrorResponse = {
      code: 10001,
      msg: 'Error occurred',
    };

    if (error instanceof ErrorMessage) {
      response.code = error.code;
      response.msg = error.message;
    } else if (typeof error === 'number') {
      response.code = error;
    } else if (error instanceof Error) {
      response.msg = error.message;
      response.stack = (serverConfig.env === 'development') ? error.stack : null;
    } else {
      response.msg = String(error);
    }

    if (!response.msg || response.msg === '%s') {
      delete response.msg;
    }

    return response;
  }
}