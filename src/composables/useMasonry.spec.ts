import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeMasonryLayout, useMasonry } from './useMasonry'

describe('computeMasonryLayout', () => {
  it('spreads the first items across columns, then packs each into the shortest column', () => {
    const { positions, height } = computeMasonryLayout([100, 200, 150, 120, 300, 50], 1000, 4, 16)
    // 列宽 (1000 - 16*3) / 4 = 238，列间距 16 → 列左边界 0 / 254 / 508 / 762
    expect(positions).toEqual([
      { left: 0, top: 0, width: 238 },
      { left: 254, top: 0, width: 238 },
      { left: 508, top: 0, width: 238 },
      { left: 762, top: 0, width: 238 },
      { left: 0, top: 116, width: 238 },
      { left: 762, top: 136, width: 238 },
    ])
    expect(height).toBe(416)
  })

  it('stacks everything in a single column', () => {
    const { positions, height } = computeMasonryLayout([100, 200, 50], 300, 1, 16)
    expect(positions).toEqual([
      { left: 0, top: 0, width: 300 },
      { left: 0, top: 116, width: 300 },
      { left: 0, top: 332, width: 300 },
    ])
    expect(height).toBe(382)
  })

  it('breaks height ties toward the leftmost column', () => {
    const { positions } = computeMasonryLayout([100, 100, 100], 500, 2, 10)
    expect(positions[0]).toMatchObject({ left: 0, top: 0 })
    expect(positions[1]).toMatchObject({ left: 255, top: 0 })
    expect(positions[2]).toMatchObject({ left: 0, top: 110 })
  })

  it('returns an empty layout for no items', () => {
    expect(computeMasonryLayout([], 1000, 4, 16)).toEqual({ positions: [], height: 0 })
  })
})

describe('useMasonry', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const Harness = defineComponent({
    setup() {
      const container = ref<HTMLElement | null>(null)
      const items = ref([0, 1, 2, 3, 4, 5])
      useMasonry(container, () => items.value)
      return { container, items }
    },
    template: '<div ref="container"><div v-for="i in items" :key="i" class="m-item"></div></div>',
  })

  it('positions children by shortest column and sizes the container', async () => {
    const wrapper = mount(Harness)
    const el = wrapper.element as HTMLElement
    Object.defineProperty(el, 'clientWidth', { value: 1000, configurable: true })
    const heights = [100, 200, 150, 120, 300, 50]
    Array.from(el.children).forEach((child, i) => {
      Object.defineProperty(child, 'offsetHeight', { value: heights[i], configurable: true })
    })
    await flushPromises()
    await nextTick()

    const items = Array.from(el.children) as HTMLElement[]
    expect(items[0].style.left).toBe('0px')
    expect(items[0].style.top).toBe('0px')
    expect(items[0].style.width).toBe('238px')
    expect(items[4].style.left).toBe('0px')
    expect(items[4].style.top).toBe('116px')
    expect(items[5].style.left).toBe('762px')
    expect(items[5].style.top).toBe('136px')
    expect(el.style.height).toBe('416px')
    wrapper.unmount()
  })

  it('relayouts when the item set changes', async () => {
    const wrapper = mount(Harness)
    const el = wrapper.element as HTMLElement
    Object.defineProperty(el, 'clientWidth', { value: 1000, configurable: true })
    const stub = (child: Element, h: number) =>
      Object.defineProperty(child, 'offsetHeight', { value: h, configurable: true })
    Array.from(el.children).forEach((child) => stub(child, 100))
    await flushPromises()
    await nextTick()
    // 6 幅同高、4 列：前两列各叠两幅，最高列 100+16+100 = 216
    expect(el.style.height).toBe('216px')

    const vm = wrapper.vm as unknown as { items: number[] }
    vm.items = [0, 1]
    await flushPromises()
    await nextTick()
    Array.from(el.children).forEach((child) => stub(child, 100))
    await flushPromises()
    await nextTick()
    // 只剩 2 幅、各占一列顶部：容器高 100
    expect(el.children).toHaveLength(2)
    expect(el.style.height).toBe('100px')
    wrapper.unmount()
  })

  it('mounts and unmounts without layout APIs (jsdom)', async () => {
    vi.unstubAllGlobals()
    const wrapper = mount(Harness)
    await flushPromises()
    expect(wrapper.findAll('.m-item')).toHaveLength(6)
    wrapper.unmount()
  })
})