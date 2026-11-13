import { mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import ArtworkCard from './ArtworkCard.vue'
import { presetArtworks } from '../data/artworks'
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
    const small = await mountCard(0)
    try {
      expect(small.artwork.thumbnail).toBeUndefined()
      expect(small.wrapper.find('.pixel-preview').exists()).toBe(true)
      expect(small.wrapper.find('img').exists()).toBe(false)
    } finally {
      small.wrapper.unmount()
    }

    const chunkedIndex = presetArtworks.findIndex((artwork) => artwork.thumbnail !== undefined)
    const large = await mountCard(chunkedIndex)
    try {
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