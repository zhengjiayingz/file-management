import request from '@utils/request'

export type ShareValidity = '1d' | '7d' | '30d' | '1y' | 'forever'

export interface CreateSharePayload {
  userFileIds: number[]
  validity: ShareValidity
  extractMode: 'random' | 'custom'
  customExtract?: string
  autoFillExtract: boolean
  maxVisitors: number | null
}

export interface CreateShareResult {
  shareId: number
  shareCode: string
  extractCode: string | null
  expireAt: string | null
  autoFillExtract: boolean
  maxVisitors: number | null
  userFileIds: number[]
}

export async function createShareLink(payload: CreateSharePayload): Promise<CreateShareResult> {
  const res = await request.post<{ data: CreateShareResult }>('/shares', payload)
  return res.data.data
}

/** 访客：分享页 */
export interface SharePublicFileItem {
  id: number
  fileName: string
  fileType: string
  size: number
  mimeType: string | null
  downloadable: boolean
}

export async function getSharePublicMeta(shareCode: string) {
  const res = await request.get<{
    data: { shareCode: string; needExtract: boolean; itemCount: number; expireAt: string | null }
  }>(`/shares/public/${encodeURIComponent(shareCode)}`)
  return res.data.data
}

export async function accessSharePublic(shareCode: string, extractCode?: string) {
  const res = await request.post<{
    data: {
      shareCode: string
      extractCode: string | null
      ownerUsername: string | null
      files: SharePublicFileItem[]
    }
  }>(`/shares/public/${encodeURIComponent(shareCode)}/access`, {
    extractCode: extractCode?.trim() || undefined
  })
  return res.data.data
}

export function buildShareFileDownloadUrl(
  shareCode: string,
  userFileId: number,
  extractCode?: string | null
) {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const q = new URLSearchParams()
  if (extractCode) q.set('extractCode', extractCode)
  const qs = q.toString()
  return `${base}/api/shares/public/${encodeURIComponent(shareCode)}/file/${userFileId}/download${qs ? `?${qs}` : ''}`
}
