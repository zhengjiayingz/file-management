/**
 * 在 Worker 中计算 SparkMD5，避免大文件/多分片阻塞主线程。
 */
import SparkMD5 from 'spark-md5'
import { CHUNK_SIZE } from '@/utils/chunkConstants'

type Inbound =
  | { id: number; type: 'file-hash'; file: File }
  | { id: number; type: 'chunk-hash'; buffer: ArrayBuffer }

self.onmessage = async (ev: MessageEvent<Inbound>) => {
  const msg = ev.data
  const { id, type } = msg

  try {
    if (type === 'file-hash') {
      const file = msg.file
      const spark = new SparkMD5.ArrayBuffer()
      const total = Math.ceil(file.size / CHUNK_SIZE)
      for (let i = 0; i < total; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const buf = await file.slice(start, end).arrayBuffer()
        spark.append(buf)
      }
      const hash = spark.end()
      const out: { id: number; type: 'file-hash'; hash: string } = { id, type: 'file-hash', hash }
      self.postMessage(out)
      return
    }

    if (type === 'chunk-hash') {
      const spark = new SparkMD5.ArrayBuffer()
      spark.append(msg.buffer)
      const hash = spark.end()
      const out: { id: number; type: 'chunk-hash'; hash: string } = { id, type: 'chunk-hash', hash }
      self.postMessage(out)
      return
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    self.postMessage({ id, error: err })
  }
}

export {}
