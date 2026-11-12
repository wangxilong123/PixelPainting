import { presetArtworks } from '../data/artworks'
import type { PixelArtwork } from '../models/artwork'
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

export function getArtworkById(id: string): PixelArtwork | undefined {
  return presetArtworks.find((artwork) => artwork.id === id)
}

export function searchArtworks(
  query: string,
  options: { page?: number; pageSize?: number } = {},
): ArtworkPage {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 12
  const keyword = query.trim().toLowerCase()
  const matched = keyword === ''
    ? [...presetArtworks]
    : presetArtworks.filter((artwork) => artwork.title.toLowerCase().includes(keyword)
      || artwork.tags.some((tag) => tag.toLowerCase().includes(keyword)))
  const start = (page - 1) * pageSize
  return {
    items: start < 0 ? [] : matched.slice(start, start + pageSize),
    total: matched.length,
    page,
    pageSize,
  }
}