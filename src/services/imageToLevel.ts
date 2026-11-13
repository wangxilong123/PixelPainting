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
  /** Reduce the palette to at most this many colors instead of rejecting the image. */
  colorCap?: number
  /** Grid width cap. Wider sources are downsampled by each cell's most common opaque color. */
  maxWidth?: number
  mergeDistance?: number
  source?: 'preset' | 'user'
}

const alphaThreshold = 128

// 截断调色板时跳过与已保留色过近的近似色：照片的大面积背景会产生几十种几乎相同的
// 灰/暗色，按纯像素数取前 N 会把名额耗光、把主体的鲜艳色挤掉并snap成灰（整图变黑白）
const capMergeDistance = 60

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

function cellRange(total: number, cell: number, count: number): [number, number] {
  return [Math.floor(cell * total / count), Math.floor((cell + 1) * total / count)]
}

/** 一格取格内不透明像素的众数色，同票按十六进制升序，和清理脚本的采样口径一致。 */
export function downsampleSource(source: PixelSource, targetWidth: number): PixelSource {
  if (!Number.isInteger(targetWidth) || targetWidth < 1) {
    throw new Error(`目标格数需要正整数，收到 ${targetWidth}`)
  }
  const { width, height, data } = source
  if (targetWidth >= width) return source
  const targetHeight = Math.max(1, Math.round(height * targetWidth / width))
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4)

  for (let cellY = 0; cellY < targetHeight; cellY += 1) {
    const [top, bottom] = cellRange(height, cellY, targetHeight)
    for (let cellX = 0; cellX < targetWidth; cellX += 1) {
      const [left, right] = cellRange(width, cellX, targetWidth)
      const counts = new Map<string, number>()
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const offset = (y * width + x) * 4
          if (data[offset + 3] < alphaThreshold) continue
          const hex = hexAt(data, offset)
          counts.set(hex, (counts.get(hex) ?? 0) + 1)
        }
      }
      // 整格没有不透明像素就留透明，涂色时是空格
      if (counts.size === 0) continue
      const hex = byCountThenHex(counts)[0]
      const offset = (cellY * targetWidth + cellX) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        out[offset + channel] = Number.parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16)
      }
      out[offset + 3] = 255
    }
  }
  return { width: targetWidth, height: targetHeight, data: out }
}

function rgbOf(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

/** 只保留像素数最多的前 maxColors 种颜色，其余并进最近的保留色，编号从 1 重排。 */
export function capQuantizedColors(quantized: QuantizedSource, maxColors: number): QuantizedSource {
  if (!Number.isInteger(maxColors) || maxColors < 1) {
    throw new Error(`颜色上限需要正整数，收到 ${maxColors}`)
  }
  const { palette, ids } = quantized
  if (palette.length <= maxColors) return quantized

  const kept: PaletteColor[] = []
  for (const color of palette) {
    if (kept.length >= maxColors) break
    if (kept.some((candidate) => channelDistance(color.hex, candidate.hex) <= capMergeDistance)) continue
    kept.push(color)
  }
  const keptRgb = kept.map((color) => rgbOf(color.hex))
  const idOfHex = new Map(kept.map((color, index) => [color.hex, index + 1]))
  const cappedPalette = kept.map((color, index) => ({
    id: index + 1,
    hex: color.hex,
    name: /^色 \d+$/.test(color.name) ? `色 ${index + 1}` : color.name,
  }))

  const cappedIds = new Map<string, number>()
  for (const [hex, oldId] of ids) {
    const original = palette[oldId - 1]
    if (!original) continue
    const direct = idOfHex.get(original.hex)
    if (direct !== undefined) {
      cappedIds.set(hex, direct)
      continue
    }
    const rgb = rgbOf(original.hex)
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (const [index, candidate] of keptRgb.entries()) {
      const distance = Math.abs(rgb[0] - candidate[0])
        + Math.abs(rgb[1] - candidate[1])
        + Math.abs(rgb[2] - candidate[2])
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }
    cappedIds.set(hex, bestIndex + 1)
  }
  return { palette: cappedPalette, ids: cappedIds }
}

export function imageToLevel(source: PixelSource, meta: LevelMeta): Level {
  const prepared = meta.maxWidth !== undefined ? downsampleSource(source, meta.maxWidth) : source
  let quantized = quantizeSource(prepared, {
    maxColors: meta.maxColors,
    mergeDistance: meta.mergeDistance,
    colorNames: meta.colorNames,
  })
  if (meta.colorCap !== undefined) {
    quantized = capQuantizedColors(quantized, meta.colorCap)
  }
  const { palette, ids } = quantized
  const { width, height, data } = prepared

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
    tags: meta.tags ?? [],
    source: meta.source ?? 'preset',
  }
}
