import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PixelArtwork } from '../models/artwork'
import type { LevelProgress, ProgressSource } from '../models/level'

// 不带时区的 ISO 串按本地时间解析，完成时间的断言才不会跟着运行机器的时区漂
const older = '2026-11-10T09:00:00'
const newer = '2026-11-12T18:30:00'
const STORAGE_KEY = 'pixel-painting:v2:progress'

function makeUserArtwork(id: string, title: string, tags: string[] = []): PixelArtwork {
  return {
    id,
    title,
    tags,
    width: 2,
    height: 2,
    palette: [{ id: 1, hex: '#F4A261', name: '橘' }],
    cells: [1, 1, 1, 0],
  }
}

function completed(work: PixelArtwork, source: ProgressSource, at: string): LevelProgress {
  return {
    levelId: work.id,
    source,
    painted: [...work.cells],
    elapsedSeconds: 42,
    hintsUsed: 1,
    completedAt: at,
  }
}

function partial(work: PixelArtwork, source: ProgressSource, paintedCount: number): LevelProgress {
  const painted = work.cells.map((colorId, index) => (index < paintedCount ? colorId : 0))
  return { levelId: work.id, source, painted, elapsedSeconds: 10, hintsUsed: 0 }
}

function seed(records: Record<string, LevelProgress>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentId: null, records }))
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function loadProfile() {
  const storage = await import('../services/artworkStorage')
  const { presetArtworks } = await import('../data/artworks')
  const { getLevels, getInteractiveCellCount } = await import('../services/levelService')
  const { createAppRouter } = await import('../router')
  const { default: ProfilePage } = await import('./ProfilePage.vue')
  return { storage, presetArtworks, getLevels, getInteractiveCellCount, createAppRouter, ProfilePage }
}

async function mountProfile(ProfilePage: any, createAppRouter: any) {
  const router = createAppRouter(createMemoryHistory())
  await router.push('/profile')
  await router.isReady()
  const wrapper = mount(ProfilePage, { global: { plugins: [router] } })
  // 冷启动时 IndexedDB 的 open 事件比一次 flushPromises 慢，等加载态真正结束
  await vi.waitFor(() => {
    expect(wrapper.find('.profile-loading').exists()).toBe(false)
  }, { timeout: 5000 })
  await flushPromises()
  return { wrapper, router }
}

describe('ProfilePage', () => {
  it('shows zeroed stats and the first-run empty state for an empty save', async () => {
    const { createAppRouter, ProfilePage, getLevels } = await loadProfile()
    const { wrapper } = await mountProfile(ProfilePage, createAppRouter)
    try {
      expect(wrapper.findAll('.stat-value').map((node) => node.text()))
        .toEqual(['0幅', '0格', `0/${getLevels().length}关`])
      expect(wrapper.find('.profile-notice').exists()).toBe(false)
      expect(wrapper.get('.profile-empty-first').text()).toContain('还没有完成的作品')
      expect(wrapper.findAll('.artwork-card')).toHaveLength(0)
      expect(wrapper.get('.portfolio-count').text()).toBe('共 0 幅已完成')
      const links = wrapper.findAll('.profile-cta')
      expect(links.map((link) => link.attributes('href'))).toEqual(['/levels', '/'])
    } finally {
      wrapper.unmount()
    }
  })

  it('counts completed works and painted pixels across level, preset and user sources', async () => {
    const { storage, presetArtworks, getLevels, getInteractiveCellCount, createAppRouter, ProfilePage }
      = await loadProfile()
    const [firstLevel] = getLevels()
    const preset = presetArtworks[1]
    const user = makeUserArtwork('user-profile-a', '我的橘猫', ['原创'])
    await storage.saveUserArtwork(user, new Blob(['png'], { type: 'image/png' }))
    seed({
      [firstLevel.id]: completed(firstLevel, 'level', older),
      [preset.id]: completed(preset, 'artwork', newer),
      [user.id]: partial(user, 'user', 1),
    })

    const { wrapper } = await mountProfile(ProfilePage, createAppRouter)
    try {
      const expectedPixels = getInteractiveCellCount(firstLevel) + getInteractiveCellCount(preset) + 1
      expect(wrapper.findAll('.stat-value').map((node) => node.text()))
        .toEqual(['2幅', `${expectedPixels}格`, `1/${getLevels().length}关`])

      const cards = wrapper.findAll('.artwork-card')
      expect(cards).toHaveLength(2)
      expect(wrapper.findAll('.card-title').map((node) => node.text()))
        .toEqual([preset.title, firstLevel.title])
      expect(wrapper.findAll('.card-badge').map((node) => node.text())).toEqual(['素材', '关卡'])
      expect(wrapper.findAll('.card-note').map((node) => node.text())).toEqual([
        '完成于 2026-11-12 18:30',
        '完成于 2026-11-10 09:00',
      ])
      expect(cards[0].attributes('href')).toBe(`/paint/${preset.id}`)
      expect(cards[1].attributes('href')).toBe(`/game/${firstLevel.id}`)
      expect(cards[1].attributes('aria-label')).toBe(`${firstLevel.title}，重玩关卡`)
      expect(wrapper.get('.portfolio-count').text()).toBe('共 2 幅已完成')
    } finally {
      wrapper.unmount()
    }
  })

  it('filters the portfolio by keyword and restores it when the search is cleared', async () => {
    const { presetArtworks, createAppRouter, ProfilePage } = await loadProfile()
    const [first, second] = presetArtworks
    seed({
      [first.id]: completed(first, 'artwork', older),
      [second.id]: completed(second, 'artwork', newer),
    })
    const { wrapper } = await mountProfile(ProfilePage, createAppRouter)
    try {
      expect(wrapper.findAll('.artwork-card')).toHaveLength(2)

      await wrapper.get('input[type="search"]').setValue(first.title)
      await flushPromises()
      expect(wrapper.findAll('.card-title').map((node) => node.text())).toEqual([first.title])

      await wrapper.get('input[type="search"]').setValue('不存在的关键词')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(0)
      expect(wrapper.get('.profile-empty').text()).toContain('没有找到匹配的作品')
      expect(wrapper.get('.portfolio-count').text()).toBe('共 2 幅已完成')

      await wrapper.get('.search-clear').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(2)
    } finally {
      wrapper.unmount()
    }
  })

  it('pages the portfolio at twelve cards per page', async () => {
    const { storage, getLevels, createAppRouter, ProfilePage } = await loadProfile()
    const levels = getLevels()
    // 素材与关卡同图会被去重，分页要用内容互不相同的用户作品凑数
    const extras: PixelArtwork[] = Array.from({ length: 6 }, (_, index) => ({
      id: `user-page-${index}`,
      title: `原创 ${index + 1}`,
      tags: [],
      width: 2,
      height: index + 2,
      palette: [{ id: 1, hex: '#F4A261', name: '橘' }],
      cells: Array<number>(2 * (index + 2)).fill(1),
    }))
    for (const extra of extras) {
      await storage.saveUserArtwork(extra, new Blob(['png'], { type: 'image/png' }))
    }
    const works = [...levels, ...extras]
    const records: Record<string, LevelProgress> = {}
    for (const [index, work] of works.entries()) {
      const source: ProgressSource = index < levels.length ? 'level' : 'user'
      records[work.id] = completed(work, source, new Date(Date.UTC(2026, 10, 1, index)).toISOString())
    }
    seed(records)

    const { wrapper } = await mountProfile(ProfilePage, createAppRouter)
    try {
      expect(wrapper.findAll('.artwork-card')).toHaveLength(12)
      expect(wrapper.get('.pager-status').text()).toBe('第 1 / 2 页')
      expect(wrapper.get('.portfolio-count').text()).toBe(`共 ${works.length} 幅已完成`)

      await wrapper.findAll('.pager button')[1].trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(works.length - 12)
      expect(wrapper.get('.pager-status').text()).toBe('第 2 / 2 页')
    } finally {
      wrapper.unmount()
    }
  })

  it('shows one card for a picture completed both as a level and as a material', async () => {
    const { presetArtworks, getLevels, createAppRouter, ProfilePage } = await loadProfile()
    const [firstLevel] = getLevels()
    const twin = presetArtworks.find((artwork) => artwork.title === firstLevel.title)
    if (!twin) throw new Error('preset twin of the first level is missing')
    seed({
      [firstLevel.id]: completed(firstLevel, 'level', older),
      [twin.id]: completed(twin, 'artwork', newer),
    })

    const { wrapper } = await mountProfile(ProfilePage, createAppRouter)
    try {
      const cards = wrapper.findAll('.artwork-card')
      expect(cards).toHaveLength(1)
      expect(cards[0].attributes('href')).toBe(`/paint/${twin.id}`)
      expect(wrapper.get('.card-badge').text()).toBe('素材')
      expect(wrapper.get('.card-note').text()).toBe('完成于 2026-11-12 18:30')
      expect(wrapper.get('.portfolio-count').text()).toBe('共 1 幅已完成')
      // 成绩卡仍按两条完成记录计数，去重只影响作品集展示
      expect(wrapper.findAll('.stat-value')[0].text()).toBe('2幅')
    } finally {
      wrapper.unmount()
    }
  })

  it('opens the paint route from a portfolio card', async () => {
    const { presetArtworks, createAppRouter, ProfilePage } = await loadProfile()
    const [first] = presetArtworks
    seed({ [first.id]: completed(first, 'artwork', older) })
    const { wrapper, router } = await mountProfile(ProfilePage, createAppRouter)
    try {
      await wrapper.get(`a[href="/paint/${first.id}"]`).trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('paint')
      expect(router.currentRoute.value.params.artworkId).toBe(first.id)
    } finally {
      wrapper.unmount()
    }
  })

  it('replays a completed level even when its predecessors were reset', async () => {
    const { getLevels, createAppRouter, ProfilePage } = await loadProfile()
    const [first, second] = getLevels()
    seed({
      [first.id]: partial(first, 'level', 1),
      [second.id]: completed(second, 'level', newer),
    })
    const { wrapper } = await mountProfile(ProfilePage, createAppRouter)
    try {
      const card = wrapper.get('.artwork-card')
      expect(card.attributes('href')).toBe(`/game/${second.id}`)
      expect(card.attributes('aria-label')).toBe(`${second.title}，重玩关卡`)
      expect(wrapper.get('.card-badge').text()).toBe('关卡')
    } finally {
      wrapper.unmount()
    }
  })

  it('shows the session-only notice without IndexedDB and still renders stats', async () => {
    vi.unstubAllGlobals()
    const { createAppRouter, ProfilePage, getLevels } = await loadProfile()
    const { wrapper } = await mountProfile(ProfilePage, createAppRouter)
    try {
      expect(wrapper.get('.profile-notice').text()).toContain('会话')
      expect(wrapper.findAll('.stat-value').map((node) => node.text()))
        .toEqual(['0幅', '0格', `0/${getLevels().length}关`])
      expect(wrapper.find('.profile-empty-first').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })
})