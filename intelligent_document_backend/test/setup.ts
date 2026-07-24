import dotenv from 'dotenv';
import path from 'path';

// 强制加载 .env.test（override: true 覆盖终端里错误的 DATABASE_URL，例如曾设过占位符「密码」）
dotenv.config({
  path: path.resolve(process.cwd(), '.env.test'),
  override: true,
});

process.env.NODE_ENV = 'test';