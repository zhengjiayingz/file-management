import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkUserStorage() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        storageUsed: true,
        storageQuota: true
      }
    })

    console.log('=== User Storage Info ===')
    for (const user of users) {
      console.log(`User: ${user.username} (ID: ${user.id})`)
      console.log(`  Storage Used: ${user.storageUsed} bytes (${(Number(user.storageUsed) / 1024 / 1024).toFixed(2)} MB)`)
      console.log(`  Storage Quota: ${user.storageQuota} bytes (${(Number(user.storageQuota) / 1024 / 1024 / 1024).toFixed(2)} GB)`)
      console.log('---')
    }

    // Also check total file sizes
    const fileStorages = await prisma.fileStorage.findMany({
      where: {
        userFiles: {
          some: {
            isDeleted: false
          }
        }
      },
      select: {
        id: true,
        fileSize: true,
        referenceCount: true,
        userFiles: {
          where: {
            isDeleted: false
          },
          select: {
            userId: true,
            fileName: true
          }
        }
      }
    })

    console.log('\n=== Active File Storages ===')
    let totalSize = BigInt(0)
    for (const storage of fileStorages) {
      totalSize += storage.fileSize
      console.log(`File: ${storage.userFiles[0]?.fileName || 'Unknown'}`)
      console.log(`  Size: ${storage.fileSize} bytes (${(Number(storage.fileSize) / 1024 / 1024).toFixed(2)} MB)`)
      console.log(`  Reference Count: ${storage.referenceCount}`)
    }
    console.log(`\nTotal Active Storage: ${totalSize} bytes (${(Number(totalSize) / 1024 / 1024).toFixed(2)} MB)`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkUserStorage()
