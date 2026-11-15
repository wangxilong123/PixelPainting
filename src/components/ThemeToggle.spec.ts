import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const key = 'pixel-painting:v1:theme'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

async function mountToggle() {
  const { default: ThemeToggle } = await import('./ThemeToggle.vue')
  return mount(ThemeToggle, { attachTo: document.body })
}

describe('ThemeToggle', () => {
  it('shows the current theme and offers the opposite one', async () => {
    const wrapper = await mountToggle()
    const button = wrapper.get('button')

    expect(wrapper.get('.theme-label').text()).toBe('深色')
    expect(wrapper.get('svg').attributes('data-name')).toBe('moon')
    expect(button.attributes('aria-label')).toBe('切换到浅色主题')
    expect(button.attributes('title')).toBe('切换到浅色主题')
    expect(button.attributes('type')).toBe('button')

    wrapper.unmount()
  })

  it('switches the whole document and remembers the choice on click', async () => {
    const wrapper = await mountToggle()

    await wrapper.get('button').trigger('click')

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(key)).toBe('light')
    expect(wrapper.get('.theme-label').text()).toBe('浅色')
    expect(wrapper.get('svg').attributes('data-name')).toBe('sun')
    expect(wrapper.get('button').attributes('aria-label')).toBe('切换到深色主题')

    await wrapper.get('button').trigger('click')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(key)).toBe('dark')
    expect(wrapper.get('.theme-label').text()).toBe('深色')
    expect(wrapper.get('svg').attributes('data-name')).toBe('moon')

    wrapper.unmount()
  })

  it('opens on the stored light theme', async () => {
    localStorage.setItem(key, 'light')

    const wrapper = await mountToggle()

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(wrapper.get('.theme-label').text()).toBe('浅色')
    expect(wrapper.get('svg').attributes('data-name')).toBe('sun')

    wrapper.unmount()
  })

  it('keeps two toggles in step with each other', async () => {
    const topbar = await mountToggle()
    const gameBar = await mountToggle()

    await topbar.get('button').trigger('click')

    expect(gameBar.get('.theme-label').text()).toBe('浅色')
    expect(gameBar.get('svg').attributes('data-name')).toBe('sun')

    topbar.unmount()
    gameBar.unmount()
  })
})