export const PREVIEW_QUEUE_NAME = 'preview-convert';
export const PREVIEW_JOB_NAME = 'convert';

export type PreviewConvertOp =
  'impress-partial' | 'impress-partial-more' | 'full';

export type PreviewConvertJobData = {
  op: PreviewConvertOp;
  fileHash: string;
  sourceFilePath: string;
  isBackground?: boolean;
  targetSlides?: number;
};

export type PreviewConvertJobResult = {
  path: string;
  phase: 'full' | 'partial';
};

export type PreviewJobState =
  | 'missing'
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'prioritized'
  | 'unknown';

export type PreviewJobInfo = {
  state: PreviewJobState;
  attemptsMade?: number;
  failedReason?: string;
};
