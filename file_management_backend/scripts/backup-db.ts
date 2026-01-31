import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]; // Simple date YYYY-MM-DD
  // Use project root 'backups' folder
  const backupDir = path.resolve(process.cwd(), 'backups');
  
  // 创建备份目录
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  console.log(`Starting backup to ${backupDir}...`);

  // Models list in order of no-dependency first (ideally)
  const models = [
    'User',
    'UserPreference',
    'FileStorage',
    'UserFile',
    'UploadChunk',
    'FileShare',
    'ShareAccessLog',
    'Friendship',
    'Message',
    'FileTag',
    'UserFileTag',
    'OperationLog',
    'LoginLog',
    'RefreshToken',
    'FileVersion'
  ];

  const backupData: Record<string, any[]> = {};

  for (const model of models) {
    try {
      // @ts-ignore
      const data = await prisma[model.charAt(0).toLowerCase() + model.slice(1)].findMany();
      if (data) {
        // Save individually to files
        const fileName = `${model}.json`;
        const filePath = path.join(backupDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(data, (key, value) =>
            typeof value === 'bigint'
                ? value.toString()
                : value
        , 2));
        console.log(`✅ Backed up ${model}: ${data.length} records`);
      }
    } catch (e: any) {
       console.error(`❌ Failed to backup ${model}: ${e.message}`);
    }
  }
  
  console.log('Backup completed successfully.');
}

backupDatabase()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('Backup failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
