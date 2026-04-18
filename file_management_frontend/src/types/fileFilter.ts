import type { FileTypeCategory } from './file'

/** 可配置的筛选字段开关（未写明的项默认为 true） */
export interface FileFilterFeatures {
  fileName: boolean
  createdRange: boolean
  fileTypeCategory: boolean
  entryKind: boolean
  tag: boolean
}

export interface FileFilterState {
  q: string
  createdFrom?: string
  createdTo?: string
  type: FileTypeCategory
  entryKind: 'all' | 'file' | 'folder'
  tagId?: number
}

export function defaultFileFilterState(): FileFilterState {
  return {
    q: '',
    createdFrom: undefined,
    createdTo: undefined,
    type: 'all',
    entryKind: 'all',
    tagId: undefined
  }
}

export const defaultFileFilterFeatures: FileFilterFeatures = {
  fileName: true,
  createdRange: true,
  fileTypeCategory: true,
  entryKind: true,
  tag: true
}
