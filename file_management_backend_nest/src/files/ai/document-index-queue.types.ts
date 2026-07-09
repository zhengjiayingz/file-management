export const DOCUMENT_INDEX_QUEUE_NAME = 'document-index';
export const DOCUMENT_INDEX_JOB_NAME = 'index';

export type DocumentIndexJobData = {
  userFileId: number;
  userId: number;
  mode: 'general' | 'academic';
};
