/**
 * 文件/分片 MD5：通过 Web Worker 计算（Vite 打包 `file-hash.worker.ts`）。
 */
let worker: Worker | null = null
let seq = 0
const pending = new Map<
  number,
  { resolve: (v: string) => void; reject: (e: Error) => void }
>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/file-hash.worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = (ev: MessageEvent) => {
    const data = ev.data as
      | { id: number; hash: string; type: 'file-hash' | 'chunk-hash'; error?: never }
      | { id: number; error: string; hash?: never }

    const p = pending.get(data.id)
    if (!p) return
    pending.delete(data.id)
    if ('error' in data && data.error) {
      p.reject(new Error(data.error))
    } else if ('hash' in data && typeof data.hash === 'string') {
      p.resolve(data.hash)
    } else {
      p.reject(new Error('Worker 返回格式异常'))
    }
  }
  worker.onerror = (e) => {
    for (const [, { reject }] of pending) {
      reject(new Error(e.message))
    }
    pending.clear()
  }
  return worker
}

function runHash(
  payload:
    | { type: 'file-hash'; file: File }
    | { type: 'chunk-hash'; buffer: ArrayBuffer; transfer?: ArrayBuffer[] },
): Promise<string> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const w = getWorker()
    if (payload.type === 'file-hash') {
      w.postMessage({ id, type: 'file-hash', file: payload.file })
    } else {
      const transfer = payload.transfer ?? [payload.buffer]
      w.postMessage({ id, type: 'chunk-hash', buffer: payload.buffer }, transfer)
    }
  })
}

/** 整文件 MD5（秒传预检），在 Worker 中分片读取并增量 hash */
export function calculateFileHashInWorker(file: File): Promise<string> {
  return runHash({ type: 'file-hash', file })
}

/**
 * 单个分片 MD5。会将 `buffer` **转移**给 Worker，调用后请勿再使用该 ArrayBuffer。
 * 若需保留 buffer，请先 clone。
 */
export function calculateChunkHashInWorker(buffer: ArrayBuffer): Promise<string> {
  return runHash({ type: 'chunk-hash', buffer, transfer: [buffer] })
}

/** 释放 Worker（例如单测或页面卸载时可选调用） */
export function terminateHashWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    for (const [, { reject }] of pending) {
      reject(new Error('Worker 已终止'))
    }
    pending.clear()
  }
}
