import { IDBDatabase, IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PixelArtwork } from '../models/artwork'

function artwork(id: string): PixelArtwork {
  return {
    id,
    title: `作品 ${id}`,
    tags: ['像素'],
    width: 2,
    height: 2,
    palette: [{ id: 1, hex: '#F4A261', name: '色 1' }],
    cells: [1, 1, 1, 0],
  }
}

function original(): Blob {
  return new Blob(['original-bytes'], { type: 'image/png' })
}

// 每个用例重置模块，拿到全新的内存表、降级标记与注册表
async function loadStorage() {
  vi.resetModules()
  const storage = await import('./artworkStorage')
  const service = await import('./artworkService')
  return { storage, service }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('artworkStorage over IndexedDB', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
  })

  it('saves then lists the artwork and keeps the original retrievable', async () => {
    const { storage } = await loadStorage()
    const art = artwork('user-a')
    const id = await storage.saveUserArtwork(art, original())

    expect(id).toBe('user-a')
    expect(storage.storageNotice.value).toBeNull()
    const list = await storage.listUserArtworks()
    expect(list.map((entry) => entry.id)).toEqual(['user-a'])
    const stored = await storage.getUserArtwork('user-a')
    expect(stored?.artwork).toEqual(art)
    expect(stored?.original).toBeDefined()
  })

  it('deletes the artwork from both the list and single lookup', async () => {
    const { storage } = await loadStorage()
    await storage.saveUserArtwork(artwork('user-a'), original())
    await storage.deleteUserArtwork('user-a')

    expect(await storage.listUserArtworks()).toEqual([])
    expect(await storage.getUserArtwork('user-a')).toBeUndefined()
  })

  it('lists newest first', async () => {
    const { storage } = await loadStorage()
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    await storage.saveUserArtwork(artwork('user-old'), original())
    now.mockReturnValue(2000)
    await storage.saveUserArtwork(artwork('user-mid'), original())
    now.mockReturnValue(3000)
    await storage.saveUserArtwork(artwork('user-new'), original())

    const list = await storage.listUserArtworks()
    expect(list.map((entry) => entry.id)).toEqual(['user-new', 'user-mid', 'user-old'])
  })

  it('registers on save and unregisters on delete', async () => {
    const { storage, service } = await loadStorage()
    await storage.saveUserArtwork(artwork('user-a'), original())

    expect(service.isUserArtwork('user-a')).toBe(true)
    expect(service.getArtworkById('user-a')?.title).toBe('作品 user-a')

    await storage.deleteUserArtwork('user-a')
    expect(service.isUserArtwork('user-a')).toBe(false)
    expect(service.getArtworkById('user-a')).toBeUndefined()
  })

  it('warms the registry on list so a reload keeps progress resolvable', async () => {
    const first = await loadStorage()
    await first.storage.saveUserArtwork(artwork('user-a'), original())

    // 模拟刷新：新模块实例注册表为空，但 IndexedDB 全局仍在
    const second = await loadStorage()
    expect(second.service.isUserArtwork('user-a')).toBe(false)
    await second.storage.listUserArtworks()
    expect(second.service.getArtworkById('user-a')?.id).toBe('user-a')
  })

  it('warms the registry on single lookup for the painting page', async () => {
    const first = await loadStorage()
    await first.storage.saveUserArtwork(artwork('user-a'), original())

    const second = await loadStorage()
    expect(second.service.getArtworkById('user-a')).toBeUndefined()
    const stored = await second.storage.getUserArtwork('user-a')
    expect(stored?.artwork.id).toBe('user-a')
    expect(second.service.getArtworkById('user-a')?.id).toBe('user-a')
  })

  it('rejects an invalid artwork without storing or registering it', async () => {
    const { storage, service } = await loadStorage()
    const bad = { ...artwork('user-bad'), cells: [1, 1] }

    await expect(storage.saveUserArtwork(bad, original())).rejects.toThrow(/cells\.length/)
    expect(await storage.listUserArtworks()).toEqual([])
    expect(service.isUserArtwork('user-bad')).toBe(false)
  })

  it('mints unique user IDs', async () => {
    const { storage } = await loadStorage()
    const ids = Array.from({ length: 50 }, () => storage.newUserArtworkId())

    expect(new Set(ids).size).toBe(50)
    expect(ids.every((id) => id.startsWith('user-'))).toBe(true)
  })
})

describe('artworkStorage memory fallback', () => {
  it('degrades with a clear notice when IndexedDB is absent', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { storage, service } = await loadStorage()
    const id = await storage.saveUserArtwork(artwork('user-a'), original())

    expect(storage.storageNotice.value).toMatch(/会话/)
    expect((await storage.listUserArtworks()).map((entry) => entry.id)).toEqual([id])
    expect(service.isUserArtwork(id)).toBe(true)
    expect(await (await storage.getUserArtwork(id))?.original.text()).toBe('original-bytes')

    await storage.deleteUserArtwork(id)
    expect(await storage.listUserArtworks()).toEqual([])
    expect(service.isUserArtwork(id)).toBe(false)
  })

  it('degrades when opening the database throws', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
    const { storage } = await loadStorage()
    await storage.saveUserArtwork(artwork('user-a'), original())

    expect(storage.storageNotice.value).toMatch(/会话/)
    expect((await storage.listUserArtworks()).map((entry) => entry.id)).toEqual(['user-a'])
  })

  it('keeps working in memory after a read failure mid-session', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const { storage } = await loadStorage()
    await storage.saveUserArtwork(artwork('user-a'), original())

    // 让后续只读事务抛错，触发降级；本次会话写入的镜像仍在内存里
    const realTransaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<typeof realTransaction>) {
      if (args[1] === 'readonly') throw new Error('read failed')
      return realTransaction.apply(this, args)
    } as typeof realTransaction
    try {
      const list = await storage.listUserArtworks()
      expect(storage.storageNotice.value).toMatch(/会话/)
      expect(list.map((entry) => entry.id)).toEqual(['user-a'])
    } finally {
      IDBDatabase.prototype.transaction = realTransaction
    }
  })
})