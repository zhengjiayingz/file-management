import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const files = await prisma.userFile.findMany({
      where: { isDeleted: false },
      include: { storage: true },
      take: 10
    });
    console.log(JSON.stringify(files.map(f => ({
      id: f.id,
      fileName: f.fileName,
      mimeType: f.storage?.mimeType,
      fileHash: f.storage?.fileHash,
      filePath: f.storage?.filePath
    })), null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
