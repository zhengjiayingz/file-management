import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 根据环境变量决定日志级别
const getLogLevel = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['error']
  }
  
  // 开发环境下，通过 PRISMA_LOG_QUERIES 环境变量控制是否显示 SQL 查询
  const logLevels = ['error', 'warn']
  
  if (process.env.PRISMA_LOG_QUERIES === 'true') {
    logLevels.push('query')
  }
  
  return logLevels
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: getLogLevel()
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma