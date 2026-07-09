import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      user_file_id: number;
      indexed_file_hash: string | null;
      file_hash: string | null;
      created_at: Date;
    }>
  >`
    SELECT dij.id,
           dij.user_file_id,
           dij.indexed_file_hash,
           fs.file_hash,
           dij.created_at
    FROM document_index_jobs dij
    JOIN user_files uf ON uf.id = dij.user_file_id
    LEFT JOIN file_storage fs ON fs.id = uf.storage_id
    WHERE dij.indexed_file_hash IS NULL
      AND dij.status = 'ready'
  `;

  console.log('待回填记录:', rows.length);
  for (const row of rows) {
    console.log(row);
  }

  const updated = await prisma.$executeRaw`
    UPDATE document_index_jobs dij
    JOIN user_files uf ON uf.id = dij.user_file_id
    JOIN file_storage fs ON fs.id = uf.storage_id
    SET dij.indexed_file_hash = fs.file_hash
    WHERE dij.indexed_file_hash IS NULL
      AND dij.status = 'ready'
      AND uf.storage_id IS NOT NULL
  `;

  console.log('已更新行数:', updated);

  const remaining = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*) AS cnt
    FROM document_index_jobs
    WHERE indexed_file_hash IS NULL AND status = 'ready'
  `;
  console.log('剩余未回填:', remaining[0]?.cnt?.toString() ?? '0');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
