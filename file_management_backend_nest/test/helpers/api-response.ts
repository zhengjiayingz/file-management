export interface ApiBody<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  total?: number;
}

export interface ApiMessageBody {
  success?: boolean;
  message: string;
}

export interface FileListItem {
  id: number;
  fileName?: string;
  parentId?: number | null;
  fileType?: string;
}

export interface TextChunkData {
  text: string;
  totalSize: number;
  done: boolean;
}

export function apiBody<T>(body: unknown): ApiBody<T> {
  return body as ApiBody<T>;
}

export function apiMessage(body: unknown): ApiMessageBody {
  return body as ApiMessageBody;
}
