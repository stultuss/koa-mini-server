import {CommonTools} from './Utility';
import {ERROR_CODE} from '../constant/exception';

export class ErrorFormat extends Error {
  public code: number;
  
  constructor(code: number, ...argus) {
    super();
    this.code = code;
    this.message = this.getExMsg(argus);
  }
  
  public getExMsg(argus: any[]): string {
    return CommonTools.format((ERROR_CODE.hasOwnProperty(this.code) ? ERROR_CODE[this.code] : '%s'), ...argus);
  }
}