import type { Level, PaletteColor } from '../models/level'

/** RGBA buffer shaped like ImageData so Node and the browser can both feed it. */
export type PixelSource = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type QuantizeOptions = {
  maxColors?: number
  /** Color names keyed by hex, case-insensitive. */
  colorNames?: Record<string, string>
}

export type LevelMeta = {
  id: string
  title: string
  category: string
  difficulty: 1 | 2 | 3
  order?: number
  tags?: string[]
  colorNames?: Record<string, string>
  maxColors?: number
  source?: 'preset' | 'user'
}

const alphaThreshold = 128

function hexAt(data: Uint8ClampedArray, offset: number): string {
  let hex = '#'
  for (let channel = 0; channel < 3; channel += 1) {
    hex += data[offset + channel].toString(16).padStart(2, '0').toUpperCase()
  }
  return hex
}

export function quantizePalette(source: PixelSource, options: QuantizeOptions = {}): PaletteColor[] {
  const { width, height, data } = source
  const counts = new Map<string, number>()
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    if (data[offset + 3] < alphaThreshold) continue
    const hex = hexAt(data, offset)
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }

  if (counts.size === 0) {
    throw new Error('图片没有任何不透明像素，无法生成关卡')
  }
  const { maxColors } = options
  if (maxColors !== undefined && counts.size > maxColors) {
    throw new Error(`图片含 ${counts.size} 种颜色，超过上限 ${maxColors}`)
  }

  const names = new Map(
    Object.entries(options.colorNames ?? {}).map(([hex, name]) => [hex.toUpperCase(), name]),
  )
  // 常用色排在前面，同数量按十六进制升序，保证同一张图每次生成同样的编号
  const ordered = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([hex]) => hex)

  return ordered.map((hex, index) => ({
    id: index + 1,
    hex,
    name: names.get(hex) ?? `色 ${index + 1}`,
  }))
}

export function imageToLevel(source: PixelSource, meta: LevelMeta): Level {
  const palette = quantizePalette(source, {
    maxColors: meta.maxColors,
    colorNames: meta.colorNames,
  })
  const ids = new Map(palette.map((color) => [color.hex, color.id]))
  const { width, height, data } = source

  const cells: number[] = []
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    if (data[offset + 3] < alphaThreshold) {
      cells.push(0)
      continue
    }
    cells.push(ids.get(hexAt(data, offset)) ?? 0)
  }

  return {
    id: meta.id,
    title: meta.title,
    category: meta.category,
    difficulty: meta.difficulty,
    width,
    height,
    palette,
    cells,
    order: meta.order,
    tags: meta.tags,
    source: meta.source ?? 'preset',
  }
}
