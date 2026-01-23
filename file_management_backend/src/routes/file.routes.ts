import express, { Router } from 'express';
import {
  uploadFile,
  getFiles,
  getFileById,
  deleteFile,
  downloadFile,
  checkFileExists,
  uploadChunk,
  getUploadedChunks,
  mergeChunks,
  instantUpload,
  createFolder,
  renameFile,
  moveFile
} from '../controllers/file.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router: Router = express.Router();

// 所有文件路由都需要认证
router.use(authenticate);

// 检查文件是否存在（秒传检测）
router.post('/check-exists', checkFileExists);

// 分片上传
router.post('/upload-chunk', upload.single('chunk'), uploadChunk);

// 获取已上传的分片列表
router.get('/chunks/:fileHash', getUploadedChunks);

// 合并分片
router.post('/merge-chunks', mergeChunks);

// 秒传文件
router.post('/instant-upload', instantUpload);

// 传统上传文件（保留兼容性）
router.post('/upload', upload.single('file'), uploadFile);

// 创建文件夹
router.post('/folder', createFolder);

// 获取文件列表
router.get('/', getFiles);

// 获取单个文件信息
router.get('/:id', getFileById);

// 下载文件
router.get('/:id/download', downloadFile);

// 重命名文件/文件夹
router.put('/:id/rename', renameFile);

// 移动文件/文件夹
router.put('/:id/move', moveFile);

// 删除文件
router.delete('/:id', deleteFile);

export default router;
