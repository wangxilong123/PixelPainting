import { mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import ArtworkCard from './ArtworkCard.vue'
import { presetArtworks } from '../data/artworks'
import type { PixelArtwork } from '../models/artwork'
import { createAppRouter } from '../router'
import { getInteractiveCellCount } from '../services/levelService'

async function mountCard(index: number) {
  const router = createAppRouter(createMemoryHistory())
  await router.push('/')
  await router.isReady()
  const artwork = presetArtworks[index]
  const wrapper = mount(ArtworkCard, {
    props: { artwork },
    global: { plugins: [router] },
  })
  return { wrapper, artwork }
}

describe('ArtworkCard', () => {
  it('links to free painting and shows name, dimensions, cell count and tags', async () => {
    const { wrapper, artwork } = await mountCard(0)
    try {
      const link = wrapper.get('a.artwork-card')
      expect(link.attributes('href')).toBe(`/paint/${artwork.id}`)
      expect(wrapper.get('.card-title').text()).toBe(artwork.title)
      expect(wrapper.get('.card-meta').text())
        .toBe(`${artwork.width}×${artwork.height} · ${getInteractiveCellCount(artwork)} 格`)
      expect(wrapper.findAll('.card-tag').map((tag) => tag.text())).toEqual(artwork.tags)
    } finally {
      wrapper.unmount()
    }
  })

  it('renders a pixel preview without a thumbnail and an image with one', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/')
    await router.isReady()
    // 剔除三幅小图后预设素材都带缩略图，无缩略图分支改用一幅合成小图验证
    const small: PixelArtwork = {
      id: 'user-card-no-thumb',
      title: '无缩略图',
      tags: ['原创'],
      width: 2,
      height: 2,
      palette: [{ id: 1, hex: '#FFCC66', name: '琥珀' }],
      cells: [1, 1, 1, 1],
    }
    const smallWrapper = mount(ArtworkCard, { props: { artwork: small }, global: { plugins: [router] } })
    try {
      expect(small.thumbnail).toBeUndefined()
      expect(smallWrapper.find('.pixel-preview').exists()).toBe(true)
      expect(smallWrapper.find('img').exists()).toBe(false)
    } finally {
      smallWrapper.unmount()
    }

    const large = await mountCard(0)
    try {
      expect(large.artwork.thumbnail).toBeDefined()
      const img = large.wrapper.get('img.card-thumb')
      expect(img.attributes('src')).toBe(large.artwork.thumbnail)
      expect(large.wrapper.find('.pixel-preview').exists()).toBe(false)
    } finally {
      large.wrapper.unmount()
    }
  })

  it('carries a portfolio badge, completion note and custom target', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/')
    await router.isReady()
    const artwork = presetArtworks[0]
    const wrapper = mount(ArtworkCard, {
      props: {
        artwork,
        to: { name: 'game', params: { levelId: 'level-001' } },
        badge: '关卡',
        note: '完成于 2026-11-12 18:30',
        actionLabel: '重玩关卡',
      },
      global: { plugins: [router] },
    })
    try {
      const link = wrapper.get('a.artwork-card')
      expect(link.attributes('href')).toBe('/game/level-001')
      expect(link.attributes('aria-label')).toBe(`${artwork.title}，重玩关卡`)
      expect(wrapper.get('.card-badge').text()).toBe('关卡')
      expect(wrapper.get('.card-note').text()).toBe('完成于 2026-11-12 18:30')
    } finally {
      wrapper.unmount()
    }
  })

  it('omits the badge and note when they are not given', async () => {
    const { wrapper } = await mountCard(0)
    try {
      expect(wrapper.find('.card-badge').exists()).toBe(false)
      expect(wrapper.find('.card-note').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})