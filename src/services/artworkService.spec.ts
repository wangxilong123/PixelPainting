import { describe, expect, it } from 'vitest'
import { presetArtworks } from '../data/artworks'
import { getLevels } from './levelService'
import { getArtworkById, searchArtworks } from './artworkService'

describe('artwork registry', () => {
  it('registers the preset levels as artworks with ids of their own', () => {
    const levelIds = new Set(getLevels().map((level) => level.id))
    expect(presetArtworks.length).toBe(getLevels().length)
    for (const artwork of presetArtworks) {
      expect(levelIds.has(artwork.id)).toBe(false)
      expect(artwork.tags.length).toBeGreaterThan(0)
    }
    expect(new Set(presetArtworks.map((artwork) => artwork.id)).size).toBe(presetArtworks.length)
  })

  it('looks artworks up by id and returns undefined for unknown ids', () => {
    const [first] = presetArtworks
    expect(getArtworkById(first.id)).toBe(first)
    expect(getArtworkById('art-999')).toBeUndefined()
    expect(getArtworkById('level-001')).toBeUndefined()
  })
})

describe('searchArtworks', () => {
  it('returns everything in registration order for an empty query', () => {
    const result = searchArtworks('')
    expect(result.items).toEqual([...presetArtworks])
    expect(result.total).toBe(presetArtworks.length)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(12)
    expect(searchArtworks('   ').items).toEqual([...presetArtworks])
  })

  it('matches titles and tags, case-insensitively', () => {
    expect(searchArtworks('企鹅').items.map((artwork) => artwork.title)).toEqual(['企鹅', '企鹅'])
    expect(searchArtworks('火箭').items).toHaveLength(1)
    expect(searchArtworks('动物').items).toHaveLength(4)
    expect(searchArtworks('PENGUIN').items).toHaveLength(2)
    expect(searchArtworks('甜点').items.map((artwork) => artwork.title)).toEqual(['甜甜圈'])
    expect(searchArtworks('不存在的关键词').items).toEqual([])
  })

  it('pages twelve per row-set by default and keeps total on out-of-range pages', () => {
    const all = searchArtworks('')
    expect(all.items).toHaveLength(Math.min(12, all.total))

    const paged = searchArtworks('', { page: 2, pageSize: 3 })
    expect(paged.items).toEqual([...presetArtworks].slice(3, 6))
    expect(paged.total).toBe(presetArtworks.length)
    expect(paged.page).toBe(2)
    expect(paged.pageSize).toBe(3)

    const last = searchArtworks('', { page: 3, pageSize: 3 })
    expect(last.items).toEqual([...presetArtworks].slice(6))

    for (const page of [0, -1, 4, 99]) {
      const out = searchArtworks('', { page, pageSize: 3 })
      expect(out.items).toEqual([])
      expect(out.total).toBe(presetArtworks.length)
    }
  })

  it('searches within the matched set when paging', () => {
    const result = searchArtworks('企鹅', { page: 2, pageSize: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(2)
    expect(result.items[0].id).toBe(presetArtworks[7].id)
  })
})