import dotenv from 'dotenv';

/** 须在读取 process.env 的模块之前加载（ESM 下 import 会先于 app.ts 里的 dotenv.config 执行） */
const portFromShell = process.env.PORT;
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ override: true });
  if (portFromShell) {
    process.env.PORT = portFromShell;
  }
}
