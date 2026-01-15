/**
 * 简单的测试服务器
 * 用于测试数据库连接，不依赖 Prisma
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testDatabaseConnection, createTestTable } from './test-db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: (origin, callback) => {
    // 开发环境允许所有 localhost 端口
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) {
      callback(null, true);
    } else if (process.env.CORS_ORIGIN) {
      callback(null, process.env.CORS_ORIGIN);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: '测试服务器运行中',
    timestamp: new Date().toISOString()
  });
});

// 测试数据库连接
app.get('/api/test/connection', async (req, res) => {
  console.log('\n🧪 开始测试数据库连接...\n');
  const result = await testDatabaseConnection();
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// 创建测试表
app.post('/api/test/create-table', async (req, res) => {
  console.log('\n🧪 开始创建测试表...\n');
  const result = await createTestTable();
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log('🚀 测试服务器启动成功！');
  console.log(`📡 服务器地址: http://localhost:${PORT}`);
  console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
  console.log(`🧪 测试连接: http://localhost:${PORT}/api/test/connection`);
  console.log(`📝 创建测试表: POST http://localhost:${PORT}/api/test/create-table`);
  console.log('\n等待请求...\n');
});
