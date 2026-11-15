// 画布颜色从 CSS 变量读，主题一切换就跟着走；读不到变量（jsdom、样式没加载）
// 时退回深色主题的原值，画布照常画得出来。
const fallbacks = {
  backdrop: '#11111b',
  cell: '#f1f0f8',
  grid: '#64647d',
  label: '#292941',
  select: '#526dca',
  hint: '#a25e00',
  error: '#d12b42',
  part: '#6a6a99',
  next: '#ffcc66',
  done: '#7ce38b',
  ink: '#11111b',
  'part-line': 'rgb(255 255 255 / 55%)',
} as const

export type CanvasTheme = { -readonly [K in keyof typeof fallbacks]: string }

export function readThemeColor(token: string, fallback: string): string {
  if (typeof document === 'undefined' || typeof globalThis.getComputedStyle !== 'function') return fallback
  const value = globalThis.getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value === '' ? fallback : value
}

export function readCanvasTheme(): CanvasTheme {
  const theme = { ...fallbacks } as CanvasTheme
  if (typeof document === 'undefined' || typeof globalThis.getComputedStyle !== 'function') return theme
  // 一次取计算样式读完整套变量，避免每个色都重新算一遍样式
  const style = globalThis.getComputedStyle(document.documentElement)
  for (const key of Object.keys(fallbacks) as (keyof typeof fallbacks)[]) {
    const value = style.getPropertyValue(`--canvas-${key}`).trim()
    if (value !== '') theme[key] = value
  }
  return theme
}

/** #rrggbb 拆成三通道，供未涂格子的淡色混合用；解析不了就退回白 */
export function hexChannels(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return [255, 255, 255]
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}