/** 业务可预期的失败（合并参数、分片不全、哈希不符等），由上层映射为 4xx */
export class MergeUploadError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'MergeUploadError';
  }
}

export type MergeChunksBody = {
  fileHash: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  parentId?: number;
  conflictAction?: string;
};
