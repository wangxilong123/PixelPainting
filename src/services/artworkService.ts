import { presetArtworks } from '../data/artworks'
import { presetCollections } from '../data/collections'
import type { PixelArtwork } from '../models/artwork'
import type { Collection } from '../models/collection'
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
  return presetArtworks.find((artwork) => artwork.id === id)
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
  const matched = presetArtworks.filter((artwork) => artworkMatchesQuery(artwork, query))
  const start = (page - 1) * pageSize
  return {
    items: start < 0 ? [] : matched.slice(start, start + pageSize),
    total: matched.length,
    page,
    pageSize,
  }
}

export function searchCollections(query: string): Collection[] {
  const keyword = query.trim().toLowerCase()
  if (keyword === '') return [...presetCollections]
  return presetCollections.filter((collection) => collection.title.toLowerCase().includes(keyword)
    || collection.tags.some((tag) => tag.toLowerCase().includes(keyword)))
}

export function getCollectionById(
  id: string,
): { collection: Collection; artworks: PixelArtwork[] } | undefined {
  const collection = presetCollections.find((entry) => entry.id === id)
  if (!collection) return undefined
  const artworks = collection.artworkIds
    .map((artworkId) => getArtworkById(artworkId))
    .filter((artwork): artwork is PixelArtwork => artwork !== undefined)
  return { collection, artworks }
}
