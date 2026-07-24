import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { cleanupE2eTestData } from './helpers/e2e-cleanup';

const nestEnv = resolve(__dirname, '../.env');
const expressEnv = resolve(
  __dirname,
  '../../intelligent_document_backend/.env',
);
if (existsSync(nestEnv)) {
  dotenv.config({ path: nestEnv });
} else if (existsSync(expressEnv)) {
  dotenv.config({ path: expressEnv });
}

/** Jest globalTeardown：全部 e2e 跑完后清理测试数据 */
export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_SKIP_CLEANUP === '1') {
    console.log('[e2e teardown] E2E_SKIP_CLEANUP=1，跳过清理');
    return;
  }

  const result = await cleanupE2eTestData({ verbose: true });
  if (result.users > 0) {
    console.log(
      `[e2e teardown] 已清理 users=${result.users}, login_logs=${result.loginLogs}, file_storage=${result.orphanedFileStorage}`,
    );
  }
}
