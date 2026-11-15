import { describe, expect, it, vi } from 'vitest'
import { hexChannels, readCanvasTheme, readThemeColor } from './canvasTheme'

function stubTokens(tokens: Record<string, string>) {
  const computed = vi.fn(() => ({
    getPropertyValue: (name: string) => tokens[name] ?? '',
  }))
  vi.stubGlobal('getComputedStyle', computed)
  return computed
}

describe('readThemeColor', () => {
  it('reads a token off the root element and trims it', () => {
    const computed = stubTokens({ '--canvas-part-line': '  rgb(43 36 29 / 45%)  ' })

    expect(readThemeColor('--canvas-part-line', 'rgb(255 255 255 / 55%)'))
      .toBe('rgb(43 36 29 / 45%)')
    expect(computed).toHaveBeenCalledWith(document.documentElement)

    vi.unstubAllGlobals()
  })

  it('keeps the fallback when the token is missing or unreadable', () => {
    stubTokens({})
    expect(readThemeColor('--canvas-part-line', 'rgb(255 255 255 / 55%)'))
      .toBe('rgb(255 255 255 / 55%)')

    vi.unstubAllGlobals()
    vi.stubGlobal('getComputedStyle', undefined)
    expect(readThemeColor('--canvas-cell', '#f1f0f8')).toBe('#f1f0f8')

    vi.unstubAllGlobals()
  })
})

describe('readCanvasTheme', () => {
  it('reads the whole palette from a single computed style', () => {
    const computed = stubTokens({
      '--canvas-backdrop': '#e3dbcb',
      '--canvas-cell': '#fdfbf6',
      '--canvas-grid': '#8a8172',
      '--canvas-label': '#3a332b',
      '--canvas-select': '#3b53b8',
      '--canvas-hint': '#925600',
      '--canvas-error': '#c81e37',
      '--canvas-part': '#9a8f7c',
      '--canvas-next': '#925600',
      '--canvas-done': '#1f7a41',
      '--canvas-ink': '#fffdf8',
      '--canvas-part-line': 'rgb(43 36 29 / 45%)',
    })

    const theme = readCanvasTheme()

    expect(computed).toHaveBeenCalledTimes(1)
    expect(theme).toEqual({
      backdrop: '#e3dbcb',
      cell: '#fdfbf6',
      grid: '#8a8172',
      label: '#3a332b',
      select: '#3b53b8',
      hint: '#925600',
      error: '#c81e37',
      part: '#9a8f7c',
      next: '#925600',
      done: '#1f7a41',
      ink: '#fffdf8',
      'part-line': 'rgb(43 36 29 / 45%)',
    })

    vi.unstubAllGlobals()
  })

  it('keeps the dark fallbacks for tokens the stylesheet does not define', () => {
    stubTokens({ '--canvas-backdrop': '#e3dbcb' })

    const theme = readCanvasTheme()

    expect(theme.backdrop).toBe('#e3dbcb')
    expect(theme.cell).toBe('#f1f0f8')
    expect(theme.ink).toBe('#11111b')

    vi.unstubAllGlobals()
  })

  it('returns the dark palette when styles cannot be read at all', () => {
    vi.stubGlobal('getComputedStyle', undefined)

    expect(readCanvasTheme().backdrop).toBe('#11111b')
    expect(readCanvasTheme()['part-line']).toBe('rgb(255 255 255 / 55%)')

    vi.unstubAllGlobals()
  })
})

describe('hexChannels', () => {
  it('splits a hex colour into channels', () => {
    expect(hexChannels('#fdfbf6')).toEqual([253, 251, 246])
    expect(hexChannels('#11111B')).toEqual([17, 17, 27])
    expect(hexChannels('  #925600 ')).toEqual([146, 86, 0])
  })

  it('falls back to white on anything it cannot parse', () => {
    expect(hexChannels('rgb(1 2 3)')).toEqual([255, 255, 255])
    expect(hexChannels('#fff')).toEqual([255, 255, 255])
    expect(hexChannels('')).toEqual([255, 255, 255])
  })
})