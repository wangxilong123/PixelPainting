import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { LevelProgress } from '../models/level'
import { getLevels } from '../services/levelService'
import LevelCarousel from './LevelCarousel.vue'

const carouselSource = import.meta.glob('./LevelCarousel.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
})['./LevelCarousel.vue'] as string

const levels = getLevels()
const [first, second, third] = levels

const pitch = 200
const slotWidth = 160
const trackWidth = 300

type Layout = {
  left: number
  setLeft(value: number): void
  scroll(): void
}

// jsdom 不排版也不实现滚动方法，这里把几何和滚动接口补齐，才能验证居中和滚轮逻辑
function layOut(track: HTMLElement): Layout {
  const slots = [...track.children] as HTMLElement[]
  const max = Math.max(0, slots.length * pitch - trackWidth)
  let left = 0

  slots.forEach((slot, index) => {
    Object.defineProperty(slot, 'offsetLeft', { value: index * pitch, configurable: true })
    Object.defineProperty(slot, 'offsetWidth', { value: slotWidth, configurable: true })
  })
  Object.defineProperty(track, 'clientWidth', { value: trackWidth, configurable: true })
  Object.defineProperty(track, 'scrollWidth', { value: slots.length * pitch, configurable: true })
  Object.defineProperty(track, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (value: number) => {
      left = Math.min(max, Math.max(0, value))
    },
  })

  const clamp = (value: number): number => Math.min(max, Math.max(0, value))
  track.scrollBy = vi.fn((options: ScrollToOptions) => {
    left = clamp(left + (options.left ?? 0))
    track.dispatchEvent(new Event('scroll'))
  }) as unknown as typeof track.scrollBy
  track.scrollTo = vi.fn((options: ScrollToOptions) => {
    left = clamp(options.left ?? 0)
    track.dispatchEvent(new Event('scroll'))
  }) as unknown as typeof track.scrollTo

  return {
    get left() {
      return left
    },
    setLeft(value: number) {
      left = clamp(value)
    },
    scroll() {
      track.dispatchEvent(new Event('scroll'))
    },
  }
}

function mountCarousel(props: { records?: Record<string, LevelProgress>; modelValue?: string } = {}) {
  const wrapper = mount(LevelCarousel, {
    props: { levels, records: props.records ?? {}, modelValue: props.modelValue },
  })
  const track = wrapper.get('.carousel-track').element as HTMLElement
  const layout = layOut(track)
  return { wrapper, track, layout }
}

function wheel(track: HTMLElement, deltaY: number, deltaX = 0): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, deltaX, bubbles: true, cancelable: true })
  track.dispatchEvent(event)
  return event
}

async function press(wrapper: ReturnType<typeof mountCarousel>['wrapper'], key: string) {
  await wrapper.get('.carousel-track').trigger('keydown', { key })
  await nextTick()
}

const matchMedia = window.matchMedia

// jsdom 没有实现 matchMedia，组件会退回 auto，这里按需打桩
function stubMotion(reduced: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced }) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  window.matchMedia = matchMedia
})

describe('LevelCarousel', () => {
  it('turns the wheel into horizontal scrolling and blocks the page scroll', () => {
    const { track, layout } = mountCarousel()

    const down = wheel(track, 120)
    expect(down.defaultPrevented).toBe(true)
    expect(track.scrollBy).toHaveBeenCalledWith({ left: 120 })
    expect(layout.left).toBe(120)

    const up = wheel(track, -400)
    expect(up.defaultPrevented).toBe(true)
    expect(track.scrollBy).toHaveBeenLastCalledWith({ left: -400 })
    expect(layout.left).toBe(0)
  })

  it('keeps a vertical trackpad gesture horizontal', () => {
    const { track } = mountCarousel()

    const event = wheel(track, 0, 90)
    expect(event.defaultPrevented).toBe(true)
    expect(track.scrollBy).toHaveBeenCalledWith({ left: 90 })
  })

  it('hands the wheel back to the page once the track reaches an edge', () => {
    const { track, layout } = mountCarousel()

    layout.setLeft(levels.length * pitch - trackWidth)
    const atEnd = wheel(track, 120)
    expect(atEnd.defaultPrevented).toBe(false)
    expect(track.scrollBy).not.toHaveBeenCalled()

    layout.setLeft(0)
    const atStart = wheel(track, -120)
    expect(atStart.defaultPrevented).toBe(false)
    expect(track.scrollBy).not.toHaveBeenCalled()
  })

  it('steps with the bar buttons, disables them at the ends and shows the position', async () => {
    const { wrapper } = mountCarousel({ modelValue: first.id })
    const position = () => wrapper.get('.carousel-position').text()
    const steps = () => wrapper.findAll('.carousel-step')

    expect(position()).toBe(`1 / ${levels.length}`)
    expect(steps()[0].attributes('disabled')).toBeDefined()
    expect(steps()[1].attributes('disabled')).toBeUndefined()

    await steps()[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[second.id]])
    expect(position()).toBe(`2 / ${levels.length}`)

    for (let round = 0; round < levels.length - 2; round += 1) {
      await steps()[1].trigger('click')
    }
    expect(position()).toBe(`${levels.length} / ${levels.length}`)
    expect(steps()[1].attributes('disabled')).toBeDefined()
    expect(steps()[0].attributes('disabled')).toBeUndefined()
  })

  it('reports the centered level as the model value', async () => {
    const { wrapper, layout } = mountCarousel({ modelValue: first.id })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    layout.setLeft(400)
    layout.scroll()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([[third.id]])
  })

  it('moves the selection with the arrow keys and centers the card', async () => {
    stubMotion(false)
    const { wrapper, track, layout } = mountCarousel({ modelValue: first.id })

    await press(wrapper, 'ArrowRight')
    expect(wrapper.emitted('update:modelValue')).toEqual([[second.id]])
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 200 - (trackWidth - slotWidth) / 2, behavior: 'smooth' })
    expect(layout.left).toBe(130)

    await press(wrapper, 'ArrowLeft')
    expect(wrapper.emitted('update:modelValue')).toEqual([[second.id], [first.id]])
    expect(layout.left).toBe(0)
  })

  it('opens the centered level with Enter but never a locked one', async () => {
    const { wrapper } = mountCarousel({ modelValue: first.id })

    await press(wrapper, 'Enter')
    expect(wrapper.emitted('open')).toEqual([[first.id]])

    await press(wrapper, 'ArrowRight')
    await press(wrapper, 'Enter')
    expect(wrapper.emitted('open')).toEqual([[first.id]])
  })

  it('opens only unlocked levels on click', async () => {
    const { wrapper } = mountCarousel()

    await wrapper.get(`[data-level-id="${second.id}"]`).trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()

    await wrapper.get(`[data-level-id="${first.id}"]`).trigger('click')
    expect(wrapper.emitted('open')).toEqual([[first.id]])
  })

  it('marks a cleared level and unlocks only the one after it', () => {
    const records: Record<string, LevelProgress> = {
      [first.id]: {
        levelId: first.id,
        painted: [...first.cells],
        hintsUsed: 0,
        elapsedSeconds: 12,
        completedAt: '2026-11-05T10:00:00.000Z',
      },
    }
    const { wrapper } = mountCarousel({ records })

    const cards = wrapper.findAll('[data-level-id]')
    expect(cards.map((card) => card.attributes('data-level-id'))).toEqual(levels.map((level) => level.id))
    expect(cards[0].text()).toContain('已完成')
    expect(cards[0].text()).not.toContain('★')
    expect(cards[1].attributes('aria-disabled')).toBeUndefined()
    expect(cards[cards.length - 1].attributes('aria-disabled')).toBe('true')
  })

  it('drops smooth scrolling when the player prefers reduced motion', async () => {
    stubMotion(true)
    const { wrapper, track } = mountCarousel({ modelValue: first.id })

    await press(wrapper, 'ArrowRight')
    expect(track.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('keeps a card no wider than the viewport on narrow screens', () => {
    const slot = carouselSource.match(/\.carousel-slot\s*\{[^}]*\}/)?.[0] ?? ''

    expect(slot).toContain('width: min(')
    expect(slot).toContain('100%')
  })
})
