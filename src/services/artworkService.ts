import { shallowReactive } from 'vue'
import { presetArtworks } from '../data/artworks'
import { presetCollections } from '../data/collections'
import type { PixelArtwork } from '../models/artwork'
import type { Collection, UserCollection } from '../models/collection'
import { validateLevel } from './levelService'

export type ArtworkPage = {
  items: PixelArtwork[]
  total: number
  page: number
  pageSize: number
}

const artworkIds = new Set<string>()
for (const artwork of presetArtworks) {
  if (artworkIds.has(artwork.id)) {
    throw new Error(`Duplicate preset artwork ID ${artwork.id}`)
  }
  validateLevel(artwork)
  artworkIds.add(artwork.id)
}

const collectionIds = new Set<string>()
for (const collection of presetCollections) {
  if (collectionIds.has(collection.id)) {
    throw new Error(`Duplicate preset collection ID ${collection.id}`)
  }
  for (const artworkId of collection.artworkIds) {
    if (!artworkIds.has(artworkId)) {
      throw new Error(`Collection ${collection.id} references unknown artwork ${artworkId}`)
    }
  }
  collectionIds.add(collection.id)
}

export function getArtworkById(id: string): PixelArtwork | undefined {
  return presetArtworks.find((artwork) => artwork.id === id) ?? userArtworks.get(id)
}

// 用户作品在启动时由 artworkStorage 灌入这张响应式表。涂色页与存档解析都走 getArtworkById，
// 注册必须先于 loadProgressSnapshot，否则用户作品的进度记录会被当成无法解析而丢弃。
const userArtworks = shallowReactive(new Map<string, PixelArtwork>())

export function registerUserArtwork(artwork: PixelArtwork): void {
  userArtworks.set(artwork.id, artwork)
}

export function unregisterUserArtwork(id: string): void {
  userArtworks.delete(id)
}

export function isUserArtwork(id: string): boolean {
  return userArtworks.has(id)
}

// 发布到素材库的用户作品（id → 发布时间戳）。和 userArtworks 一样是响应式注册表，
// 由 materialPublish 读盘灌入；searchArtworks 把解析得到的发布作品接在预设后面。
const publishedMaterials = shallowReactive(new Map<string, number>())

export function registerPublishedMaterial(id: string, publishedAt: number): void {
  publishedMaterials.set(id, publishedAt)
}

export function unregisterPublishedMaterial(id: string): void {
  publishedMaterials.delete(id)
}

export function isPublishedMaterial(id: string): boolean {
  return publishedMaterials.has(id)
}

export function listPublishedMaterialIds(): string[] {
  return [...publishedMaterials.keys()]
}

// 用户合集与用户作品同一套路：响应式注册表由 collectionStorage 灌入，
// 查询与卡片渲染读这张表，注册/注销后依赖它的 computed 自动刷新。
const userCollections = shallowReactive(new Map<string, UserCollection>())

export function registerUserCollection(collection: UserCollection): void {
  userCollections.set(collection.id, collection)
}

export function unregisterUserCollection(id: string): void {
  userCollections.delete(id)
}

export function isUserCollection(id: string): boolean {
  return userCollections.has(id)
}

export function getUserCollection(id: string): UserCollection | undefined {
  return userCollections.get(id)
}

function byNewestCollection(a: UserCollection, b: UserCollection): number {
  return b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export function listUserCollections(): UserCollection[] {
  return [...userCollections.values()].sort(byNewestCollection)
}

/** 预设素材加用户作品的完整清单，供个人中心统计与作品集遍历。 */
export function getAllArtworks(): PixelArtwork[] {
  return [...presetArtworks, ...userArtworks.values()]
}

// 标题与标签的大小写不敏感命中；素材库搜索与合集详情内搜索共用这一条判定
export function artworkMatchesQuery(artwork: PixelArtwork, query: string): boolean {
  const keyword = query.trim().toLowerCase()
  if (keyword === '') return true
  return artwork.title.toLowerCase().includes(keyword)
    || artwork.tags.some((tag) => tag.toLowerCase().includes(keyword))
}

export function searchArtworks(
  query: string,
  options: { page?: number; pageSize?: number } = {},
): ArtworkPage {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 12
  // 预设在前，自己发布的作品按发布时间倒序接在后；解析不到的（源作品已删）自动跳过
  const published = [...publishedMaterials.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => getArtworkById(id))
    .filter((artwork): artwork is PixelArtwork => artwork !== undefined)
  const matched = [...presetArtworks, ...published].filter((artwork) => artworkMatchesQuery(artwork, query))
  const start = (page - 1) * pageSize
  return {
    items: start < 0 ? [] : matched.slice(start, start + pageSize),
    total: matched.length,
    page,
    pageSize,
  }
}

function collectionMatchesQuery(collection: Collection, query: string): boolean {
  const keyword = query.trim().toLowerCase()
  if (keyword === '') return true
  return collection.title.toLowerCase().includes(keyword)
    || collection.tags.some((tag) => tag.toLowerCase().includes(keyword))
}

/** 用户合集排在预设前面（最新创建优先），空词返回全部。 */
export function searchCollections(query: string): Collection[] {
  const all: Collection[] = [...listUserCollections(), ...presetCollections]
  return all.filter((collection) => collectionMatchesQuery(collection, query))
}

export function getCollectionById(
  id: string,
): { collection: Collection; artworks: PixelArtwork[] } | undefined {
  const collection = presetCollections.find((entry) => entry.id === id) ?? userCollections.get(id)
  if (!collection) return undefined
  // 用户合集引用的作品可能已被删除，解析不到的成员直接跳过
  const artworks = collection.artworkIds
    .map((artworkId) => getArtworkById(artworkId))
    .filter((artwork): artwork is PixelArtwork => artwork !== undefined)
  return { collection, artworks }
}
