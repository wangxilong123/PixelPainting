import type { Level, LevelParts, PaletteColor } from '../models/level'

/** RGBA buffer shaped like ImageData so Node and the browser can both feed it. */
export type PixelSource = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type QuantizeOptions = {
  maxColors?: number
  /** Merge colors whose three channel differences add up to at most this. Zero keeps every color. */
  mergeDistance?: number
  /** Color names keyed by hex, case-insensitive. */
  colorNames?: Record<string, string>
}

export type QuantizedSource = {
  palette: PaletteColor[]
  /** Exact source hex to the palette ID that paints it, merged colors included. */
  ids: Map<string, number>
}

export type LevelMeta = {
  id: string
  title: string
  category: string
  difficulty: 1 | 2 | 3
  order?: number
  tags?: string[]
  parts?: LevelParts
  colorNames?: Record<string, string>
  maxColors?: number
  mergeDistance?: number
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

function channelDistance(left: string, right: string): number {
  let total = 0
  for (let channel = 0; channel < 3; channel += 1) {
    const at = 1 + channel * 2
    const difference = Number.parseInt(left.slice(at, at + 2), 16)
      - Number.parseInt(right.slice(at, at + 2), 16)
    total += Math.abs(difference)
  }
  return total
}

// 常用色排在前面，同数量按十六进制升序，保证同一张图每次得到同样的编号
function byCountThenHex(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([hex]) => hex)
}

export function quantizeSource(source: PixelSource, options: QuantizeOptions = {}): QuantizedSource {
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

  // 近似色并到先出现的代表色上，代表色累加像素数后重新排序编号
  const mergeDistance = options.mergeDistance ?? 0
  const merged = new Map<string, number>()
  const representativeOf = new Map<string, string>()
  for (const hex of byCountThenHex(counts)) {
    const kept = mergeDistance > 0
      ? [...merged.keys()].find((candidate) => channelDistance(hex, candidate) <= mergeDistance)
      : undefined
    const representative = kept ?? hex
    merged.set(representative, (merged.get(representative) ?? 0) + (counts.get(hex) ?? 0))
    representativeOf.set(hex, representative)
  }

  const { maxColors } = options
  if (maxColors !== undefined && merged.size > maxColors) {
    throw new Error(`图片含 ${merged.size} 种颜色，超过上限 ${maxColors}`)
  }

  const names = new Map(
    Object.entries(options.colorNames ?? {}).map(([hex, name]) => [hex.toUpperCase(), name]),
  )
  const palette = byCountThenHex(merged).map((hex, index) => ({
    id: index + 1,
    hex,
    name: names.get(hex) ?? `色 ${index + 1}`,
  }))

  const idOfRepresentative = new Map(palette.map((color) => [color.hex, color.id]))
  const ids = new Map<string, number>()
  for (const [hex, representative] of representativeOf) {
    ids.set(hex, idOfRepresentative.get(representative) ?? 0)
  }
  return { palette, ids }
}

export function quantizePalette(source: PixelSource, options: QuantizeOptions = {}): PaletteColor[] {
  return quantizeSource(source, options).palette
}

export function imageToLevel(source: PixelSource, meta: LevelMeta): Level {
  const { palette, ids } = quantizeSource(source, {
    maxColors: meta.maxColors,
    mergeDistance: meta.mergeDistance,
    colorNames: meta.colorNames,
  })
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
    parts: meta.parts,
    order: meta.order,
    tags: meta.tags,
    source: meta.source ?? 'preset',
  }
}
