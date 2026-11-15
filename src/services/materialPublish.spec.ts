import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presetArtworks } from '../data/artworks'
import type { PixelArtwork } from '../models/artwork'
import {
  getArtworkById,
  isPublishedMaterial,
  registerUserArtwork,
  searchArtworks,
  unregisterPublishedMaterial,
  unregisterUserArtwork,
} from './artworkService'
import { loadPublishedMaterials, publishArtwork, unpublishArtwork } from './materialPublish'

const KEY = 'pixel-painting:v1:published'

function makeUser(id: string, title: string, tags: string[] = []): PixelArtwork {
  return {
    id,
    title,
    tags,
    width: 1,
    height: 1,
    palette: [{ id: 1, hex: '#FFCC66', name: '琥珀' }],
    cells: [1],
  }
}

const seeded: string[] = []

function seedUser(id: string, title: string, tags: string[] = []): PixelArtwork {
  const artwork = makeUser(id, title, tags)
  registerUserArtwork(artwork)
  seeded.push(id)
  return artwork
}

function disk(): unknown[] {
  return JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[]
}

beforeEach(() => {
  localStorage.clear()
  loadPublishedMaterials()
})

afterEach(() => {
  for (const id of seeded.splice(0)) {
    unpublishArtwork(id)
    unregisterUserArtwork(id)
  }
  localStorage.clear()
  loadPublishedMaterials()
  vi.restoreAllMocks()
})

describe('materialPublish', () => {
  it('publishes a user artwork into the materials library after presets', () => {
    const art = seedUser('user-pub-1', '我的橘猫', ['原创'])
    publishArtwork(art.id)
    expect(isPublishedMaterial(art.id)).toBe(true)
    const result = searchArtworks('')
    expect(result.total).toBe(presetArtworks.length + 1)
    expect(result.items[result.items.length - 1].id).toBe(art.id)
    expect(disk()).toEqual([{ id: art.id, publishedAt: expect.any(Number) }])
  })

  it('only accepts user artworks, not presets or unknown ids', () => {
    expect(() => publishArtwork('art-004')).toThrow()
    expect(() => publishArtwork('user-unknown')).toThrow()
    expect(isPublishedMaterial('art-004')).toBe(false)
    expect(disk()).toEqual([])
  })

  it('orders published works newest-first after presets', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const a = seedUser('user-pub-a', '先发布')
    publishArtwork(a.id)
    nowSpy.mockReturnValue(2000)
    const b = seedUser('user-pub-b', '后发布')
    publishArtwork(b.id)
    const ids = searchArtworks('').items.map((artwork) => artwork.id)
    expect(ids.slice(presetArtworks.length)).toEqual([b.id, a.id])
  })

  it('is searchable by title and tag', () => {
    const art = seedUser('user-pub-search', '像素风景', ['风景'])
    publishArtwork(art.id)
    expect(searchArtworks('风景').items.map((a) => a.id)).toEqual([art.id])
    expect(searchArtworks('像素风景').items.map((a) => a.id)).toEqual([art.id])
    expect(searchArtworks('不存在的关键词').items).toEqual([])
  })

  it('unpublish removes it from the library but keeps the source artwork', () => {
    const art = seedUser('user-pub-un', '撤回测试')
    publishArtwork(art.id)
    unpublishArtwork(art.id)
    expect(isPublishedMaterial(art.id)).toBe(false)
    expect(searchArtworks('').total).toBe(presetArtworks.length)
    expect(getArtworkById(art.id)).toBe(art)
    expect(disk()).toEqual([])
  })

  it('reloads published state from disk into an empty registry', () => {
    const art = seedUser('user-pub-reload', '重载测试')
    publishArtwork(art.id)
    unregisterPublishedMaterial(art.id)
    expect(isPublishedMaterial(art.id)).toBe(false)
    loadPublishedMaterials()
    expect(isPublishedMaterial(art.id)).toBe(true)
    expect(searchArtworks('').items.map((a) => a.id)).toContain(art.id)
  })

  it('skips published works whose source artwork was deleted', () => {
    const art = seedUser('user-pub-gone', '会被删的')
    publishArtwork(art.id)
    expect(searchArtworks('').total).toBe(presetArtworks.length + 1)
    unregisterUserArtwork(art.id)
    expect(searchArtworks('').total).toBe(presetArtworks.length)
    expect(searchArtworks('').items.map((a) => a.id)).not.toContain(art.id)
  })

  it('ignores corrupt disk data and de-duplicates ids', () => {
    const art = seedUser('user-pub-dup', '去重测试')
    localStorage.setItem(KEY, JSON.stringify([
      { id: art.id, publishedAt: 5 },
      { id: art.id, publishedAt: 9 },
      { id: '', publishedAt: 1 },
      { id: 'user-bad', publishedAt: 'nope' },
      null,
      'junk',
    ]))
    loadPublishedMaterials()
    expect(isPublishedMaterial(art.id)).toBe(true)
    expect(isPublishedMaterial('user-bad')).toBe(false)
    expect(searchArtworks('').items.filter((a) => a.id === art.id)).toHaveLength(1)
  })
})