import { useLocalStorage } from '../composables/useLocalStorage'
import {
  isPublishedMaterial,
  isUserArtwork,
  listPublishedMaterialIds,
  registerPublishedMaterial,
  unregisterPublishedMaterial,
} from './artworkService'

// 发布关系只是元数据（作品 ID + 发布时间），和合集一样放 localStorage；
// 作品本体仍在 IndexedDB，发布只标记它在素材库可见，不复制数据。
const storage = useLocalStorage('pixel-painting:v1:published')

type PublishedRecord = { id: string; publishedAt: number }

function isStoredRecord(value: unknown): value is PublishedRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && record.id !== ''
    && typeof record.publishedAt === 'number' && Number.isFinite(record.publishedAt)
}

function parseStored(raw: string | null): PublishedRecord[] {
  if (raw === null) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const list: PublishedRecord[] = []
  for (const entry of value) {
    if (isStoredRecord(entry) && !seen.has(entry.id)) {
      seen.add(entry.id)
      list.push({ id: entry.id, publishedAt: entry.publishedAt })
    }
  }
  return list
}

function persist(list: PublishedRecord[]): void {
  storage.write(JSON.stringify(list))
}

/** 重新读盘并把注册表同步成盘上内容（含注销已消失的记录）。 */
export function loadPublishedMaterials(): void {
  const list = parseStored(storage.read())
  const ids = new Set(list.map((record) => record.id))
  for (const existing of listPublishedMaterialIds()) {
    if (!ids.has(existing)) unregisterPublishedMaterial(existing)
  }
  for (const record of list) registerPublishedMaterial(record.id, record.publishedAt)
}

/** 把自己制作的作品发布到素材库；只能发布用户作品，重复发布刷新发布时间。 */
export function publishArtwork(id: string): void {
  if (!isUserArtwork(id)) throw new Error('只能发布自己制作的作品')
  const now = Date.now()
  const list = parseStored(storage.read()).filter((record) => record.id !== id)
  list.push({ id, publishedAt: now })
  persist(list)
  registerPublishedMaterial(id, now)
}

/** 从素材库撤回，不影响制作页里的原作品。 */
export function unpublishArtwork(id: string): void {
  if (!isPublishedMaterial(id)) return
  persist(parseStored(storage.read()).filter((record) => record.id !== id))
  unregisterPublishedMaterial(id)
}

// 模块加载即读盘注册，深链进素材库也能认得已发布作品
loadPublishedMaterials()