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
})