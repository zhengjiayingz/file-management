import express from 'express';
import {
  uploadFile,
  getFiles,
  getFileById,
  deleteFile,
  downloadFile
} from '../controllers/file.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = express.Router();

// 所有文件路由都需要认证
router.use(authenticate);

// 上传文件
router.post('/upload', upload.single('file'), uploadFile);

// 获取文件列表
router.get('/', getFiles);

// 获取单个文件信息
router.get('/:id', getFileById);

// 下载文件
router.get('/:id/download', downloadFile);

// 删除文件
router.delete('/:id', deleteFile);

export default router;
