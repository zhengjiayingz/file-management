/** 网盘文件列表变更（转存、解压等）后通知首页刷新 */
export const DRIVE_FILES_CHANGED = 'drive-files-changed'

export type DriveFilesChangedDetail = {
  parentId: number | null
}

export function notifyDriveFilesChanged(parentId?: number | null): void {
  window.dispatchEvent(
    new CustomEvent<DriveFilesChangedDetail>(DRIVE_FILES_CHANGED, {
      detail: { parentId: parentId ?? null },
    }),
  )
}
