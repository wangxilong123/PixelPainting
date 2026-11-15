import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presetCollections } from '../data/collections'
import type { PixelArtwork } from '../models/artwork'
import {
  getCollectionById,
  isUserCollection,
  registerUserArtwork,
  searchCollections,
  unregisterUserArtwork,
} from './artworkService'
import {
  deleteUserCollection,
  loadUserCollections,
  newUserCollectionId,
  restoreUserCollection,
  saveUserCollection,
} from './collectionStorage'

const KEY = 'pixel-painting:v1:collections'

beforeEach(() => {
  localStorage.clear()
  loadUserCollections()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  loadUserCollections()
})

describe('saveUserCollection', () => {
  it('creates a collection, persists it and registers it for queries', () => {
    const record = saveUserCollection({
      title: ' 我的第一辑 ',
      tags: ['原创', '原创', ' '],
      artworkIds: ['art-005', 'art-004', 'art-005'],
    })
    expect(record.id).toMatch(/^col-user-/)
    expect(record.title).toBe('我的第一辑')
    expect(record.tags).toEqual(['原创'])
    expect(record.artworkIds).toEqual(['art-005', 'art-004'])
    expect(record.cover).toBe('')
    expect(record.createdAt).toBe(record.updatedAt)
    expect(isUserCollection(record.id)).toBe(true)
    expect(getCollectionById(record.id)?.artworks.map((artwork) => artwork.id))
      .toEqual(['art-005', 'art-004'])
    const raw = JSON.parse(localStorage.getItem(KEY)!)
    expect(raw).toHaveLength(1)
    expect(raw[0].id).toBe(record.id)
  })

  it('rejects empty titles, overlong titles, empty member lists and unknown members', () => {
    expect(() => saveUserCollection({ title: '   ', tags: [], artworkIds: ['art-004'] }))
      .toThrow('名字')
    expect(() => saveUserCollection({ title: 'x'.repeat(41), tags: [], artworkIds: ['art-004'] }))
      .toThrow('40')
    expect(() => saveUserCollection({ title: '空合集', tags: [], artworkIds: [] }))
      .toThrow('至少')
    expect(() => saveUserCollection({ title: '未知成员', tags: [], artworkIds: ['art-999'] }))
      .toThrow('不存在')
    expect(searchCollections('')).toEqual([...presetCollections])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('edits in place, keeping id and createdAt while bumping updatedAt', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const created = saveUserCollection({ title: '原来的名字', tags: [], artworkIds: ['art-004'] })
    nowSpy.mockReturnValue(5000)
    const updated = saveUserCollection({
      id: created.id,
      title: '新名字',
      tags: ['改过'],
      artworkIds: ['art-005'],
    })
    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(1000)
    expect(updated.updatedAt).toBe(5000)
    expect(updated.title).toBe('新名字')
    expect(updated.artworkIds).toEqual(['art-005'])
    expect(loadUserCollections()).toHaveLength(1)
  })

  it('refuses to edit a collection that no longer exists', () => {
    expect(() => saveUserCollection({ id: 'col-user-gone', title: 'x', tags: [], artworkIds: ['art-004'] }))
      .toThrow('已不存在')
  })

  it('accepts user artworks as members', () => {
    const user: PixelArtwork = {
      id: 'user-col-test',
      title: '我的图',
      tags: [],
      width: 1,
      height: 1,
      palette: [{ id: 1, hex: '#FFFFFF', name: '白' }],
      cells: [1],
    }
    registerUserArtwork(user)
    try {
      const record = saveUserCollection({
        title: '含我的作品',
        tags: [],
        artworkIds: ['user-col-test', 'art-004'],
      })
      expect(getCollectionById(record.id)?.artworks.map((artwork) => artwork.id))
        .toEqual(['user-col-test', 'art-004'])
    } finally {
      unregisterUserArtwork(user.id)
    }
  })
})

describe('deleteUserCollection / restoreUserCollection', () => {
  it('deletes, returns the record for undo and restores it verbatim', () => {
    const record = saveUserCollection({ title: '待删', tags: ['x'], artworkIds: ['art-004'] })
    const removed = deleteUserCollection(record.id)
    expect(removed).toEqual(record)
    expect(isUserCollection(record.id)).toBe(false)
    expect(getCollectionById(record.id)).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([])

    restoreUserCollection(removed!)
    expect(isUserCollection(record.id)).toBe(true)
    expect(loadUserCollections()[0]).toEqual(record)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1)
  })

  it('returns undefined when deleting an unknown id', () => {
    expect(deleteUserCollection('col-user-nope')).toBeUndefined()
  })
})

describe('loadUserCollections', () => {
  it('drops malformed records and normalizes cover', () => {
    const good = {
      id: 'col-user-good',
      title: '好合集',
      tags: [],
      cover: 'junk',
      artworkIds: ['art-004'],
      createdAt: 1,
      updatedAt: 2,
    }
    localStorage.setItem(KEY, JSON.stringify([
      good,
      { id: 'bad' },
      null,
      { id: '', title: 'x', tags: [], artworkIds: [], createdAt: 1, updatedAt: 1 },
    ]))
    const list = loadUserCollections()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('col-user-good')
    expect(list[0].cover).toBe('')
    expect(isUserCollection('col-user-good')).toBe(true)
  })

  it('unregisters records that vanished from disk', () => {
    const record = saveUserCollection({ title: '会消失', tags: [], artworkIds: ['art-004'] })
    localStorage.setItem(KEY, JSON.stringify([]))
    expect(loadUserCollections()).toEqual([])
    expect(isUserCollection(record.id)).toBe(false)
  })

  it('survives corrupted JSON and non-array payloads', () => {
    localStorage.setItem(KEY, '{oops')
    expect(loadUserCollections()).toEqual([])
    localStorage.setItem(KEY, JSON.stringify({ collections: [] }))
    expect(loadUserCollections()).toEqual([])
  })

  it('sorts newest first with a deterministic id tiebreak', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const older = saveUserCollection({ title: '早', tags: [], artworkIds: ['art-004'] })
    nowSpy.mockReturnValue(2000)
    const newer = saveUserCollection({ title: '晚', tags: [], artworkIds: ['art-005'] })
    expect(loadUserCollections().map((entry) => entry.id)).toEqual([newer.id, older.id])
  })
})

describe('newUserCollectionId', () => {
  it('generates unique ids', () => {
    expect(newUserCollectionId()).not.toBe(newUserCollectionId())
  })
})