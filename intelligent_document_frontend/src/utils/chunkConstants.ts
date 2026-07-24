/** 分片大小：与 Worker算hash / 分片上传逻辑共用，避免不一致 */
export const CHUNK_SIZE = 5 * 1024 * 1024
