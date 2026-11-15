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

function stubSystem(light: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(prefers-color-scheme: light)' && light,
    media: query,
  })))
}

async function loadTheme() {
  const { useTheme } = await import('./useTheme')
  return useTheme()
}

describe('useTheme', () => {
  it('defaults to dark when the browser cannot report a preference', async () => {
    const theme = await loadTheme()

    expect(theme.theme.value).toBe('dark')
    expect(theme.isLight.value).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('follows a light system preference on the first visit', async () => {
    stubSystem(true)

    const theme = await loadTheme()

    expect(theme.theme.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    // 没主动切过就不写盘，下次系统偏好变了还能跟上
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('keeps a stored choice over the system preference', async () => {
    stubSystem(true)
    localStorage.setItem(key, 'dark')

    const theme = await loadTheme()

    expect(theme.theme.value).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('falls back to the system preference on a corrupted value', async () => {
    stubSystem(true)
    localStorage.setItem(key, 'sepia')

    const theme = await loadTheme()

    expect(theme.theme.value).toBe('light')
  })

  it('stores the toggle as plain text and shares it between callers', async () => {
    const first = await loadTheme()
    first.toggleTheme()

    expect(first.theme.value).toBe('light')
    expect(first.isLight.value).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(key)).toBe('light')

    const { useTheme } = await import('./useTheme')
    const second = useTheme()
    expect(second.theme.value).toBe('light')

    second.toggleTheme()
    expect(first.theme.value).toBe('dark')
    expect(localStorage.getItem(key)).toBe('dark')
  })

  it('sets an explicit theme and restores it on the next load', async () => {
    const theme = await loadTheme()
    theme.setTheme('light')

    const next = await loadTheme()
    expect(next.theme.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})