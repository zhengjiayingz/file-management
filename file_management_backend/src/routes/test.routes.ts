/**
 * 测试路由
 */

import { Router } from 'express';
import {
  createTestFile,
  getAllFiles,
  deleteTestFile,
  clearTestFiles
} from '../controllers/test.controller.js';

const router = Router();

// 创建测试文件记录
router.post('/files', createTestFile);

// 获取所有文件记录
router.get('/files', getAllFiles);

// 删除指定文件记录
router.delete('/files/:id', deleteTestFile);

// 清空所有测试文件记录
router.delete('/files', clearTestFiles);

export default router;
