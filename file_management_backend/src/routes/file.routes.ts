import express, { Router } from 'express';
import {
  uploadFile,
  checkFileExists,
  uploadChunk,
  getUploadedChunks,
  mergeChunks,
  instantUpload
} from '../controllers/file/upload.controller.js';
import {
  getFiles,
  getFileById,
  downloadFile,
  getFileThumbnail,
  checkFileName
} from '../controllers/file/query.controller.js';
import {
  createFolder,
  renameFile,
  moveFile,
  deleteFile,
  restoreFile,
  permanentDeleteFile
} from '../controllers/file/manage.controller.js';
import {
  getFileVersions,
  rollbackVersion,
  downloadVersion
} from '../controllers/file/version.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router: Router = express.Router();

// 所有文件路由都需要认证
router.use(authenticate);

// 检查文件是否存在（秒传检测）
/**
 * @swagger
 * /api/files/check-exists:
 *   post:
 *     summary: 检查文件是否已存在（秒传预检）
 *     tags: [文件上传]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileHash]
 *             properties:
 *               fileHash:
 *                 type: string
 *                 description: 文件 SHA256 哈希值
 *     responses:
 *       200:
 *         description: 检查结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exists:
 *                   type: boolean
 *                   description: 是否存在
 *                 file:
 *                   $ref: '#/components/schemas/File'
 */
router.post('/check-exists', checkFileExists);

// 检查文件名是否可用
/**
 * @swagger
 * /api/files/check-name:
 *   get:
 *     summary: 检查文件名是否可用/冲突
 *     tags: [文件上传]
 *     parameters:
 *       - in: query
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 检查结果
 */
router.post('/check-name', checkFileName);

// 分片上传
/**
 * @swagger
 * /api/files/upload-chunk:
 *   post:
 *     summary: 上传文件分片
 *     tags: [文件上传]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [chunk, fileHash, chunkIndex]
 *             properties:
 *               chunk:
 *                 type: string
 *                 format: binary
 *                 description: 分片数据文件
 *               fileHash:
 *                 type: string
 *                 description: 文件完整哈希
 *               chunkIndex:
 *                 type: integer
 *                 description: 分片索引(0开始)
 *     responses:
 *       200:
 *         description: 分片上传成功
 */
router.post('/upload-chunk', upload.single('chunk'), uploadChunk);

// 获取已上传的分片列表
/**
 * @swagger
 * /api/files/chunks/{fileHash}:
 *   get:
 *     summary: 获取已上传的分片索引
 *     tags: [文件上传]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileHash
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取分片列表
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: integer
 */
router.get('/chunks/:fileHash', getUploadedChunks);

// 合并分片
/**
 * @swagger
 * /api/files/merge-chunks:
 *   post:
 *     summary: 合并已上传的分片
 *     tags: [文件上传]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileHash, fileName]
 *             properties:
 *               fileHash:
 *                 type: string
 *               fileName:
 *                 type: string
 *               totalChunks:
 *                 type: integer
 *               parentId:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       200:
 *         description: 合并成功，文件已创建
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 file:
 *                   $ref: '#/components/schemas/File'
 */
router.post('/merge-chunks', mergeChunks);

// 秒传文件
/**
 * @swagger
 * /api/files/instant-upload:
 *   post:
 *     summary: 秒传文件（直接关联已有存储）
 *     tags: [文件上传]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileHash, fileName]
 *             properties:
 *               fileHash:
 *                 type: string
 *               fileName:
 *                 type: string
 *               fileSize:
 *                 type: integer
 *               parentId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: 秒传成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 */
router.post('/instant-upload', instantUpload);

// 传统上传文件（保留兼容性）
/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: 单文件普通上传
 *     tags: [文件上传]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               parentId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 */
router.post('/upload', upload.single('file'), uploadFile);

// 创建文件夹
/**
 * @swagger
 * /api/files/folder:
 *   post:
 *     summary: 创建新文件夹
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [folderName]
 *             properties:
 *               folderName:
 *                 type: string
 *               parentId:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       201:
 *         description: 文件夹创建成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 */
router.post('/folder', createFolder);

// 获取文件列表
/**
 * @swagger
 * /api/files:
 *   get:
 *     summary: 获取文件列表
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *         description: 父文件夹ID，'root' 表示根目录
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, image, video, document, audio, other]
 *         description: 文件类型筛选
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [name_asc, name_desc, date_asc, date_desc, size_asc, size_desc]
 *         description: 排序方式
 *       - in: query
 *         name: isDeleted
 *         schema:
 *           type: boolean
 *         description: 是否查询回收站文件
 *     responses:
 *       200:
 *         description: 成功获取列表
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/File'
 */
router.get('/', getFiles);

// 获取单个文件信息
/**
 * @swagger
 * /api/files/{id}:
 *   get:
 *     summary: 获取文件详情
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 成功获取详情
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 *       404:
 *         description: 文件不存在
 */
router.get('/:id', getFileById);

// 获取文件缩略图
/**
 * @swagger
 * /api/files/{id}/thumbnail:
 *   get:
 *     summary: 获取文件缩略图 (图片/视频)
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: 返回图片流
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/thumbnail', getFileThumbnail);

// 下载文件
/**
 * @swagger
 * /api/files/{id}/download:
 *   get:
 *     summary: 下载文件
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: 文件下载流
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/download', downloadFile);

// 重命名文件/文件夹
/**
 * @swagger
 * /api/files/{id}/rename:
 *   put:
 *     summary: 重命名文件
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newName]
 *             properties:
 *               newName:
 *                 type: string
 *     responses:
 *       200:
 *         description: 重命名成功
 */
router.put('/:id/rename', renameFile);

// 移动文件/文件夹
/**
 * @swagger
 * /api/files/{id}/move:
 *   put:
 *     summary: 移动文件
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetParentId]
 *             properties:
 *               targetParentId:
 *                 type: integer
 *                 nullable: true
 *                 description: 目标文件夹ID(null为根目录)
 *     responses:
 *       200:
 *         description: 移动成功
 */
router.put('/:id/move', moveFile);

// 删除文件（移入回收站）
/**
 * @swagger
 * /api/files/{id}:
 *   delete:
 *     summary: 删除文件（放入回收站）
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: 已移入回收站
 */
router.delete('/:id', deleteFile);

// 还原文件
/**
 * @swagger
 * /api/files/{id}/restore:
 *   post:
 *     summary: 还原回收站文件
 *     tags: [回收站]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: 还原成功
 */
router.post('/:id/restore', restoreFile);

// 彻底删除文件
/**
 * @swagger
 * /api/files/{id}/permanent:
 *   delete:
 *     summary: 彻底删除文件
 *     tags: [回收站]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: 彻底删除成功
 */
router.delete('/:id/permanent', permanentDeleteFile);

// 版本管理路由

// 获取文件历史版本
/**
 * @swagger
 * /api/files/{id}/versions:
 *   get:
 *     summary: 获取文件历史版本
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 成功获取版本列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       version:
 *                         type: integer
 *                       fileName:
 *                         type: string
 *                       fileSize:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
router.get('/:id/versions', getFileVersions);

// 回滚版本
/**
 * @swagger
 * /api/files/{id}/versions/{versionId}/rollback:
 *   post:
 *     summary: 回滚到指定历史版本
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 文件ID
 *       - in: path
 *         name: versionId
 *         required: true
 *         description: 历史记录ID (FileHistory ID)
 *     responses:
 *       200:
 *         description: 回滚成功
 */
router.post('/:id/versions/:versionId/rollback', rollbackVersion);

// 下载/预览历史版本
/**
 * @swagger
 * /api/files/{id}/versions/{versionId}/download:
 *   get:
 *     summary: 下载或预览历史版本文件
 *     description: 获取指定历史版本的物理文件流。支持通过URL query参数传递token。
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 用户文件ID (UserFile ID)
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 历史记录ID (FileHistory ID)
 *       - in: query
 *         name: preview
 *         schema:
 *           type: boolean
 *         description: 是否为预览模式 (true则inline显示，false下载，默认为false)
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: 访问令牌 (可选，当无法使用Header时使用，如直接在浏览器打开)
 *     responses:
 *       200:
 *         description: 文件流
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: 文件或版本不存在
 */
router.get('/:id/versions/:versionId/download', downloadVersion);

export default router;
