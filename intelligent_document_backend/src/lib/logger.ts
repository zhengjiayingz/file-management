import '../loadEnv.js';

import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { randomUUID } from 'crypto';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');

/** Windows GBK 终端下 colorize + 中文 msg 易乱码；可设 LOG_COLORIZE=false 关闭颜色 */
const useColorize = process.env.LOG_COLORIZE !== 'false';

/** 开发环境用同步 pretty（Windows + ESM 下 worker transport 常失效） */
const prettyStream = isDev
  ? pinoPretty({
      colorize: useColorize,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: true,
    })
  : undefined;

/** 应用级 logger：定时任务、Socket、非 HTTP 场景 */
export const logger = prettyStream
  ? pino({ level }, prettyStream)
  : pino({ level });

/** 为每条 HTTP 请求生成关联 ID */
export function genReqId(): string {
  return randomUUID();
}

export default logger;
