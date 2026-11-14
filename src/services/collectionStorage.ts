import { useLocalStorage } from '../composables/useLocalStorage'
import type { UserCollection } from '../models/collection'
import {
  getArtworkById,
  getUserCollection,
  listUserCollections,
  registerUserCollection,
  unregisterUserCollection,
} from './artworkService'

// 合集只是元数据（标题、标签、成员 ID），和进度存档一样放 localStorage；
// 写入失败时 useLocalStorage 自动留在内存里，本次会话不丢。
const storage = useLocalStorage('pixel-painting:v1:collections')

let idCounter = 0

export function newUserCollectionId(): string {
  idCounter += 1
  return `col-user-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function isStoredCollection(value: unknown): value is UserCollection {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && record.id !== ''
    && typeof record.title === 'string' && record.title !== ''
    && Array.isArray(record.tags) && record.tags.every((tag) => typeof tag === 'string')
    && Array.isArray(record.artworkIds) && record.artworkIds.every((id) => typeof id === 'string')
    && typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    && typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
}

function parseStored(raw: string | null): UserCollection[] {
  if (raw === null) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  // 用户合集封面始终留空，回退到首幅成员预览；脏数据里的 cover 一律压掉
  return value.filter(isStoredCollection).map((record) => ({ ...record, cover: '' }))
}

function persist(list: UserCollection[]): void {
  storage.write(JSON.stringify(list))
}

function upsert(record: UserCollection): void {
  const list = parseStored(storage.read()).filter((entry) => entry.id !== record.id)
  list.push(record)
  persist(list)
  registerUserCollection(record)
}

/** 重新读盘并把注册表同步成盘上内容（含注销已消失的记录），返回最新在前的列表。 */
export function loadUserCollections(): UserCollection[] {
  const list = parseStored(storage.read())
  const ids = new Set(list.map((record) => record.id))
  for (const existing of listUserCollections()) {
    if (!ids.has(existing.id)) unregisterUserCollection(existing.id)
  }
  for (const record of list) registerUserCollection(record)
  return listUserCollections()
}

export type CollectionInput = {
  id?: string
  title: string
  tags: string[]
  artworkIds: string[]
}

/** 校验通过后写入并注册；带 id 且记录存在时视为编辑，保留创建时间。 */
export function saveUserCollection(input: CollectionInput): UserCollection {
  const title = input.title.trim()
  if (title === '') throw new Error('给合集起个名字吧')
  if (title.length > 40) throw new Error('合集名字最长 40 个字')
  const artworkIds = [...new Set(input.artworkIds)]
  if (artworkIds.length === 0) throw new Error('至少选一幅作品')
  for (const id of artworkIds) {
    if (!getArtworkById(id)) throw new Error('选中的作品已不存在，请重新挑选')
  }
  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 6)
  const existing = input.id !== undefined ? getUserCollection(input.id) : undefined
  if (input.id !== undefined && !existing) throw new Error('要编辑的合集已不存在')
  const now = Date.now()
  const record: UserCollection = {
    id: existing?.id ?? newUserCollectionId(),
    title,
    tags,
    cover: '',
    artworkIds,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  upsert(record)
  return record
}

/** 删除并注销，返回被删记录供撤销；不存在时返回 undefined。 */
export function deleteUserCollection(id: string): UserCollection | undefined {
  const list = parseStored(storage.read())
  const record = list.find((entry) => entry.id === id)
  unregisterUserCollection(id)
  if (!record) return undefined
  persist(list.filter((entry) => entry.id !== id))
  return record
}

/** 撤销删除：原样写回（保留 ID 与时间戳）。 */
export function restoreUserCollection(record: UserCollection): void {
  upsert(record)
}

// 模块加载即读盘注册，深链进详情页也能认得用户合集；页面可再调 loadUserCollections 同步
loadUserCollections()