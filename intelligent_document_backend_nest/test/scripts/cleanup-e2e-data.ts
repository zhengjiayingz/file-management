/**
 * 手动清理 file_management 库中的 e2e 测试残留。
 *
 * 用法：
 *   pnpm exec ts-node test/scripts/cleanup-e2e-data.ts          # 预览
 *   pnpm exec ts-node test/scripts/cleanup-e2e-data.ts --execute # 执行删除
 *
 * 注：pnpm test:e2e 结束后会自动执行 teardown-e2e.ts 清理，一般无需手动跑。
 */
import { cleanupE2eTestData, previewE2eCleanup } from '../helpers/e2e-cleanup';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const nestEnv = resolve(__dirname, '../../.env');
const expressEnv = resolve(
  __dirname,
  '../../../intelligent_document_backend/.env',
);
if (existsSync(nestEnv)) {
  dotenv.config({ path: nestEnv });
} else if (existsSync(expressEnv)) {
  dotenv.config({ path: expressEnv });
}

async function main() {
  const execute = process.argv.includes('--execute');

  if (!execute) {
    await previewE2eCleanup();
    console.log('\n预览完成。确认无误后执行:');
    console.log(
      '  pnpm exec ts-node test/scripts/cleanup-e2e-data.ts --execute',
    );
    return;
  }

  console.log('开始删除…');
  const result = await cleanupE2eTestData({ verbose: true });
  console.log('\n删除完成:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
