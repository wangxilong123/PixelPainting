import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presetArtworks } from '../data/artworks'
import { presetCollections } from '../data/collections'
import type { PixelArtwork } from '../models/artwork'
import type { Collection } from '../models/collection'
import { getLevels } from './levelService'
import {
  artworkMatchesQuery,
  getAllArtworks,
  getArtworkById,
  getCollectionById,
  getUserCollection,
  isPublishedMaterial,
  isUserCollection,
  registerPublishedMaterial,
  registerUserArtwork,
  searchArtworks,
  searchCollections,
  unregisterPublishedMaterial,
  unregisterUserArtwork,
} from './artworkService'
import { deleteUserCollection, loadUserCollections, saveUserCollection } from './collectionStorage'

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

  it('lists preset and user artworks together for the profile stats', () => {
    const user: PixelArtwork = {
      id: 'user-registry-test',
      title: '我的作品',
      tags: ['原创'],
      width: 1,
      height: 1,
      palette: [{ id: 1, hex: '#FFCC66', name: '琥珀' }],
      cells: [1],
    }
    expect(getAllArtworks()).toEqual([...presetArtworks])
    registerUserArtwork(user)
    try {
      expect(getAllArtworks()).toEqual([...presetArtworks, user])
      expect(getArtworkById(user.id)).toBe(user)
    } finally {
      unregisterUserArtwork(user.id)
    }
    expect(getAllArtworks()).toEqual([...presetArtworks])
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

describe('searchArtworks with published materials', () => {
  it('appends published user artworks after presets newest-first and skips dangling', () => {
    const palette = [{ id: 1, hex: '#FFFFFF', name: '白' }]
    const a: PixelArtwork = { id: 'user-svc-a', title: '甲', tags: [], width: 1, height: 1, palette, cells: [1] }
    const b: PixelArtwork = { id: 'user-svc-b', title: '乙', tags: [], width: 1, height: 1, palette, cells: [1] }
    registerUserArtwork(a)
    registerUserArtwork(b)
    registerPublishedMaterial(a.id, 1000)
    registerPublishedMaterial(b.id, 2000)
    try {
      expect(isPublishedMaterial(a.id)).toBe(true)
      const presetIds = presetArtworks.map((artwork) => artwork.id)
      expect(searchArtworks('').items.map((artwork) => artwork.id)).toEqual([...presetIds, b.id, a.id])
      expect(searchArtworks('').total).toBe(presetArtworks.length + 2)
      // 源作品被删后解析不到，自动跳过，不连累其余素材
      unregisterUserArtwork(a.id)
      expect(searchArtworks('').items.map((artwork) => artwork.id)).toEqual([...presetIds, b.id])
    } finally {
      unregisterPublishedMaterial(a.id)
      unregisterPublishedMaterial(b.id)
      unregisterUserArtwork(a.id)
      unregisterUserArtwork(b.id)
    }
  })
})

describe('artworkMatchesQuery', () => {
  it('matches everything on an empty query and folds title and tag case', () => {
    const fox = getArtworkById('art-006')!
    expect(artworkMatchesQuery(fox, '')).toBe(true)
    expect(artworkMatchesQuery(fox, '   ')).toBe(true)
    expect(artworkMatchesQuery(fox, '狐狸')).toBe(true)
    expect(artworkMatchesQuery(fox, 'FOX')).toBe(true)
    expect(artworkMatchesQuery(fox, '不存在的关键词')).toBe(false)
  })
})

describe('collection registry', () => {
  it('registers collections with unique ids that reference known artworks', () => {
    expect(presetCollections.length).toBeGreaterThan(0)
    expect(new Set(presetCollections.map((entry) => entry.id)).size).toBe(presetCollections.length)
    const known = new Set(presetArtworks.map((artwork) => artwork.id))
    for (const collection of presetCollections) {
      expect(collection.tags.length).toBeGreaterThan(0)
      for (const artworkId of collection.artworkIds) {
        expect(known.has(artworkId)).toBe(true)
      }
    }
  })
})

describe('searchCollections', () => {
  it('returns every collection in registration order for an empty query', () => {
    expect(searchCollections('')).toEqual([...presetCollections])
    expect(searchCollections('   ')).toEqual([...presetCollections])
  })

  it('matches collection titles and tags', () => {
    expect(searchCollections('动物').map((entry) => entry.id)).toEqual(['col-animals'])
    expect(searchCollections('甜点').map((entry) => entry.id)).toEqual(['col-food'])
    expect(searchCollections('入门').map((entry) => entry.id)).toEqual(['col-starter'])
    expect(searchCollections('分块').map((entry) => entry.id)).toEqual(['col-big'])
    expect(searchCollections('不存在的关键词')).toEqual([])
  })
})

describe('getCollectionById', () => {
  it('returns the collection with its artworks in artworkIds order', () => {
    const result = getCollectionById('col-animals')
    expect(result?.collection.id).toBe('col-animals')
    expect(result?.artworks.map((artwork) => artwork.id))
      .toEqual(['art-001', 'art-006', 'art-007', 'art-008'])
  })

  it('returns undefined for unknown collection ids', () => {
    expect(getCollectionById('col-999')).toBeUndefined()
    expect(getCollectionById('art-001')).toBeUndefined()
  })

  it('returns an empty artwork list for a collection with no members', async () => {
    vi.resetModules()
    vi.doMock('../data/collections', async (importOriginal) => {
      const actual = await importOriginal<{ presetCollections: readonly Collection[] }>()
      const empty: Collection = { id: 'col-empty', title: '空合集', tags: ['空'], cover: '', artworkIds: [] }
      return { presetCollections: [...actual.presetCollections, empty] }
    })
    const { getCollectionById: lookup } = await import('./artworkService')
    const result = lookup('col-empty')
    expect(result?.collection.id).toBe('col-empty')
    expect(result?.artworks).toEqual([])
    vi.doUnmock('../data/collections')
    vi.resetModules()
  })
})

describe('user collection queries', () => {
  beforeEach(() => {
    localStorage.clear()
    loadUserCollections()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    loadUserCollections()
  })

  it('lists user collections ahead of presets, newest first, and searches both', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const first = saveUserCollection({ title: '我的 animal 辑', tags: ['原创'], artworkIds: ['art-001'] })
    nowSpy.mockReturnValue(2000)
    const second = saveUserCollection({ title: '第二辑', tags: ['动物'], artworkIds: ['art-002'] })

    const all = searchCollections('')
    expect(all.map((entry) => entry.id)).toEqual([second.id, first.id, ...presetCollections.map((entry) => entry.id)])
    expect(searchCollections('原创').map((entry) => entry.id)).toEqual([first.id])
    expect(searchCollections('动物').map((entry) => entry.id)).toEqual([second.id, 'col-animals'])
    expect(isUserCollection(first.id)).toBe(true)
    expect(isUserCollection('col-animals')).toBe(false)
    expect(getUserCollection(first.id)?.title).toBe('我的 animal 辑')
    expect(getUserCollection('col-animals')).toBeUndefined()
  })

  it('resolves user collection members in order and skips deleted artworks', () => {
    const user: PixelArtwork = {
      id: 'user-gone',
      title: '会被删的图',
      tags: [],
      width: 1,
      height: 1,
      palette: [{ id: 1, hex: '#FFFFFF', name: '白' }],
      cells: [1],
    }
    registerUserArtwork(user)
    const record = saveUserCollection({
      title: '混合成员',
      tags: [],
      artworkIds: ['art-002', 'user-gone', 'art-001'],
    })
    expect(getCollectionById(record.id)?.artworks.map((artwork) => artwork.id))
      .toEqual(['art-002', 'user-gone', 'art-001'])

    // 成员作品被删后，合集详情跳过解析不到的 ID，不连累整个合集
    unregisterUserArtwork(user.id)
    expect(getCollectionById(record.id)?.artworks.map((artwork) => artwork.id))
      .toEqual(['art-002', 'art-001'])

    deleteUserCollection(record.id)
    expect(getCollectionById(record.id)).toBeUndefined()
    expect(searchCollections('')).toEqual([...presetCollections])
  })
})