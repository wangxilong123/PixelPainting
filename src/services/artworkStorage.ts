import { readonly, ref } from 'vue'
import type { PixelArtwork } from '../models/artwork'
import { registerUserArtwork, unregisterUserArtwork } from './artworkService'
import { validateLevel } from './levelService'

export type StoredArtwork = {
  id: string
  artwork: PixelArtwork
  original: Blob
  createdAt: number
}

const DB_NAME = 'pixel-painting-studio'
const DB_VERSION = 1
const STORE = 'artworks'
const OPEN_TIMEOUT = 3000
const UNAVAILABLE = '当前浏览器不支持本地作品存储，制作的作品仅在本次会话内可用。'
const FAILED = '本地作品存储读写失败，制作的作品仅在本次会话内可用。'

// 降级后共用的内存表；写入始终镜像一份，IndexedDB 中途失效时本次会话的作品不丢
const memoryStore = new Map<string, StoredArtwork>()
let degraded = false
const notice = ref<string | null>(null)
/** 存储不可用时给页面展示的提示；为空表示一切正常。 */
export const storageNotice = readonly(notice)

let backendPromise: Promise<IDBDatabase | null> | undefined
let idCounter = 0

function degrade(reason: string): void {
  if (degraded) return
  degraded = true
  notice.value = reason
}

export function newUserArtworkId(): string {
  idCounter += 1
  return `user-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      degrade(UNAVAILABLE)
      resolve(null)
      return
    }
    let settled = false
    const finish = (db: IDBDatabase | null, reason?: string) => {
      if (settled) {
        db?.close()
        return
      }
      settled = true
      clearTimeout(timer)
      if (reason) degrade(reason)
      resolve(db)
    }
    const timer = setTimeout(() => finish(null, '本地作品存储打开超时，制作的作品仅在本次会话内可用。'), OPEN_TIMEOUT)
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      finish(null, UNAVAILABLE)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => finish(request.result)
    request.onerror = () => finish(null, UNAVAILABLE)
    request.onblocked = () => finish(null, '本地作品存储被其他标签页占用，制作的作品仅在本次会话内可用。')
  })
}

function getBackend(): Promise<IDBDatabase | null> {
  if (degraded) return Promise.resolve(null)
  backendPromise ??= openDatabase()
  return backendPromise
}

function idbPut(db: IDBDatabase, record: StoredArtwork): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('abort'))
  })
}

function idbGetAll(db: IDBDatabase): Promise<StoredArtwork[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result as StoredArtwork[])
    request.onerror = () => reject(request.error)
  })
}

function idbGet(db: IDBDatabase, id: string): Promise<StoredArtwork | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(id)
    request.onsuccess = () => resolve(request.result as StoredArtwork | undefined)
    request.onerror = () => reject(request.error)
  })
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('abort'))
  })
}

function byNewest(a: StoredArtwork, b: StoredArtwork): number {
  return b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** 校验通过后写入原图与生成数据，并注册到响应式表，返回作品 ID。 */
export async function saveUserArtwork(artwork: PixelArtwork, original: Blob): Promise<string> {
  validateLevel(artwork)
  const record: StoredArtwork = { id: artwork.id, artwork, original, createdAt: Date.now() }
  const db = await getBackend()
  if (db) {
    try {
      await idbPut(db, record)
    } catch {
      degrade(FAILED)
    }
  }
  memoryStore.set(record.id, record)
  registerUserArtwork(artwork)
  return record.id
}

/** 读出全部用户作品（最新在前），顺带把它们注册进响应式表供涂色页与存档解析使用。 */
export async function listUserArtworks(): Promise<PixelArtwork[]> {
  const db = await getBackend()
  let records: StoredArtwork[]
  if (db) {
    try {
      records = await idbGetAll(db)
    } catch {
      degrade(FAILED)
      records = [...memoryStore.values()]
    }
  } else {
    records = [...memoryStore.values()]
  }
  records.sort(byNewest)
  for (const record of records) registerUserArtwork(record.artwork)
  return records.map((record) => record.artwork)
}

/** 取单条记录（含原图），用于涂色页解析与删除后撤销。 */
export async function getUserArtwork(id: string): Promise<StoredArtwork | undefined> {
  const db = await getBackend()
  let record: StoredArtwork | undefined
  if (db) {
    try {
      record = await idbGet(db, id)
    } catch {
      degrade(FAILED)
      record = memoryStore.get(id)
    }
  } else {
    record = memoryStore.get(id)
  }
  if (record) registerUserArtwork(record.artwork)
  return record
}

/** 删除作品并注销注册。对应的涂色进度留给存档解析在下次加载时自行丢弃。 */
export async function deleteUserArtwork(id: string): Promise<void> {
  const db = await getBackend()
  if (db) {
    try {
      await idbDelete(db, id)
    } catch {
      degrade(FAILED)
    }
  }
  memoryStore.delete(id)
  unregisterUserArtwork(id)
}