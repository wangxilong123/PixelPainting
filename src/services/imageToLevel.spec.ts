import { describe, expect, it } from 'vitest'
import {
  capQuantizedColors,
  downsampleSource,
  imageToLevel,
  quantizePalette,
  quantizeSource,
  type PixelSource,
} from './imageToLevel'

type RGBA = [number, number, number, number]

function source(width: number, height: number, pixels: RGBA[]): PixelSource {
  if (pixels.length !== width * height) throw new Error('fixture mismatch')
  const data = new Uint8ClampedArray(width * height * 4)
  pixels.forEach((pixel, index) => data.set(pixel, index * 4))
  return { width, height, data }
}

const red: RGBA = [244, 162, 97, 255]
const brown: RGBA = [69, 49, 47, 255]
const green: RGBA = [74, 157, 98, 255]
const clear: RGBA = [0, 0, 0, 0]

describe('quantizePalette', () => {
  it('skips transparent pixels and numbers colors from 1 by pixel count', () => {
    const palette = quantizePalette(source(2, 2, [red, clear, red, green]))

    expect(palette).toEqual([
      { id: 1, hex: '#F4A261', name: '色 1' },
      { id: 2, hex: '#4A9D62', name: '色 2' },
    ])
  })

  it('treats alpha 128 and above as the same opaque color', () => {
    const semi: RGBA = [244, 162, 97, 128]
    const faint: RGBA = [244, 162, 97, 127]
    const palette = quantizePalette(source(2, 2, [red, semi, faint, clear]))

    expect(palette).toHaveLength(1)
    expect(palette[0]).toEqual({ id: 1, hex: '#F4A261', name: '色 1' })
  })

  it('reports the actual color count when maxColors is exceeded', () => {
    const board = source(3, 1, [red, brown, green])

    expect(() => quantizePalette(board, { maxColors: 2 })).toThrow(/3 种颜色/)
    expect(quantizePalette(board, { maxColors: 3 })).toHaveLength(3)
  })

  it('keeps every color at the default merge distance of zero', () => {
    const nearRed: RGBA = [244, 162, 100, 255]

    expect(quantizePalette(source(2, 1, [red, nearRed]))).toHaveLength(2)
  })

  it('merges near colors into the more common one and adds up their pixels', () => {
    const nearRed: RGBA = [244, 162, 100, 255]

    expect(quantizePalette(source(2, 2, [red, red, red, nearRed]), { mergeDistance: 3 }))
      .toEqual([{ id: 1, hex: '#F4A261', name: '色 1' }])
  })

  it('renumbers by the merged pixel count', () => {
    // green 本来和 red 同为 2 格并按十六进制排在前面，合并掉 1 格近似红之后 red 变成 3 格
    const nearRed: RGBA = [244, 162, 100, 255]
    const palette = quantizePalette(source(5, 1, [green, green, red, red, nearRed]),
      { mergeDistance: 3 })

    expect(palette).toEqual([
      { id: 1, hex: '#F4A261', name: '色 1' },
      { id: 2, hex: '#4A9D62', name: '色 2' },
    ])
  })

  it('leaves colors apart that are further than the merge distance', () => {
    expect(quantizePalette(source(2, 1, [red, brown]), { mergeDistance: 45 })).toHaveLength(2)
  })

  it('counts merged colors as one against maxColors', () => {
    const nearRed: RGBA = [244, 162, 100, 255]
    const board = source(2, 1, [red, nearRed])

    expect(() => quantizePalette(board, { maxColors: 1 })).toThrow(/2 种颜色/)
    expect(quantizePalette(board, { maxColors: 1, mergeDistance: 3 })).toHaveLength(1)
  })

  it('accepts more than twelve colors when no cap is given', () => {
    const pixels = Array.from({ length: 14 }, (_, index) => [index, 0, 0, 255] as RGBA)
    const palette = quantizePalette(source(14, 1, pixels))

    expect(palette).toHaveLength(14)
    expect(palette.map((color) => color.id)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
    expect(palette[0]?.hex).toBe('#000000')
    expect(palette[13]?.hex).toBe('#0D0000')
  })

  it('names colors from a case-insensitive hex map', () => {
    const palette = quantizePalette(source(2, 1, [red, green]), {
      colorNames: { '#f4a261': '橘色' },
    })

    expect(palette.map((color) => color.hex)).toEqual(['#4A9D62', '#F4A261'])
    expect(palette.map((color) => color.name)).toEqual(['色 1', '橘色'])
  })

  it('rejects an image without any opaque pixel', () => {
    expect(() => quantizePalette(source(2, 2, [clear, clear, clear, clear])))
      .toThrow(/不透明像素/)
  })
})

describe('imageToLevel', () => {
  it('builds a row-major level carrying the metadata through', () => {
    const level = imageToLevel(source(2, 2, [red, clear, red, green]), {
      id: 'level-900',
      title: '试投图',
      category: 'tech',
      difficulty: 2,
      order: 12,
      tags: ['像素', '试投'],
      colorNames: { '#4A9D62': '茎叶绿' },
    })

    expect(level).toEqual({
      id: 'level-900',
      title: '试投图',
      category: 'tech',
      difficulty: 2,
      width: 2,
      height: 2,
      palette: [
        { id: 1, hex: '#F4A261', name: '色 1' },
        { id: 2, hex: '#4A9D62', name: '茎叶绿' },
      ],
      cells: [1, 0, 1, 2],
      order: 12,
      tags: ['像素', '试投'],
      source: 'preset',
    })
  })

  it('omits optional metadata that was not provided', () => {
    const level = imageToLevel(source(1, 1, [red]), {
      id: 'level-901',
      title: '单格',
      category: 'other',
      difficulty: 1,
    })

    expect(level.order).toBeUndefined()
    expect(level.tags).toEqual([])
    expect(level.parts).toBeUndefined()
    expect('thumbnail' in level).toBe(false)
    expect(level.cells).toEqual([1])
  })

  it('carries the part split through and paints merged pixels with the representative id', () => {
    const nearRed: RGBA = [244, 162, 100, 255]
    const level = imageToLevel(source(2, 1, [red, nearRed]), {
      id: 'level-903',
      title: '分块',
      category: 'other',
      difficulty: 3,
      parts: { cols: 2, rows: 2 },
      mergeDistance: 3,
    })

    expect(level.parts).toEqual({ cols: 2, rows: 2 })
    expect(level.palette).toHaveLength(1)
    expect(level.cells).toEqual([1, 1])
  })

  it('passes the color cap through to quantization', () => {
    const board = source(2, 1, [red, green])

    expect(() => imageToLevel(board, {
      id: 'level-902',
      title: '超限',
      category: 'other',
      difficulty: 1,
      maxColors: 1,
    })).toThrow(/2 种颜色/)
  })

  it('downsamples to the grid cap and numbers the reduced palette by hex', () => {
    const board = source(4, 4, [
      red, red, green, green,
      red, red, green, clear,
      brown, brown, clear, clear,
      brown, red, clear, clear,
    ])
    const level = imageToLevel(board, {
      id: 'level-910',
      title: '降采样',
      category: 'other',
      difficulty: 2,
      maxWidth: 2,
    })

    expect(level.width).toBe(2)
    expect(level.height).toBe(2)
    expect(level.palette.map((color) => color.hex)).toEqual(['#45312F', '#4A9D62', '#F4A261'])
    expect(level.cells).toEqual([3, 2, 1, 0])
  })

  it('caps the palette instead of rejecting and remaps dropped colors', () => {
    const board = source(10, 1, [
      red, red, red, red, green, green, green, brown, brown, [244, 162, 100, 255],
    ])
    const level = imageToLevel(board, {
      id: 'level-911',
      title: '限色',
      category: 'other',
      difficulty: 2,
      colorCap: 2,
    })

    expect(level.palette).toHaveLength(2)
    expect(level.cells).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 2, 1])
  })

  it('combines grid cap, color cap and part split', () => {
    const board = source(4, 4, [
      red, red, green, green,
      red, red, green, clear,
      brown, brown, clear, clear,
      brown, red, clear, clear,
    ])
    const level = imageToLevel(board, {
      id: 'level-912',
      title: '组合',
      category: 'other',
      difficulty: 3,
      maxWidth: 2,
      colorCap: 1,
      parts: { cols: 2, rows: 2 },
    })

    expect(level.palette).toHaveLength(1)
    expect(level.cells).toEqual([1, 1, 1, 0])
    expect(level.parts).toEqual({ cols: 2, rows: 2 })
  })

  it('leaves the grid untouched when the cap is not below the source width', () => {
    const board = source(2, 2, [red, clear, red, green])
    const level = imageToLevel(board, {
      id: 'level-913',
      title: '不缩',
      category: 'other',
      difficulty: 1,
      maxWidth: 5,
    })

    expect(level.width).toBe(2)
    expect(level.height).toBe(2)
    expect(level.cells).toEqual([1, 0, 1, 2])
  })
})

describe('downsampleSource', () => {
  it('takes each cell’s most common opaque color', () => {
    const board = source(4, 4, [
      red, red, green, green,
      red, red, green, clear,
      brown, brown, clear, clear,
      brown, red, clear, clear,
    ])

    expect(downsampleSource(board, 2)).toEqual(source(2, 2, [red, green, brown, clear]))
  })

  it('breaks a tie by ascending hex', () => {
    expect(downsampleSource(source(2, 1, [red, green]), 1)).toEqual(source(1, 1, [green]))
  })

  it('counts alpha 128 as opaque and skips 127', () => {
    const semi: RGBA = [244, 162, 97, 128]
    const faint: RGBA = [244, 162, 97, 127]

    expect(downsampleSource(source(2, 1, [semi, faint]), 1)).toEqual(source(1, 1, [red]))
  })

  it('returns the same source when the target width is not smaller', () => {
    const board = source(2, 1, [red, green])

    expect(downsampleSource(board, 2)).toBe(board)
    expect(downsampleSource(board, 5)).toBe(board)
  })

  it('keeps the aspect ratio and never drops below one row', () => {
    const board = source(4, 2, [red, red, red, red, red, red, red, red])

    expect(downsampleSource(board, 2)).toEqual(source(2, 1, [red, red]))
  })

  it('leaves a fully transparent cell transparent', () => {
    expect(downsampleSource(source(2, 2, [clear, clear, clear, clear]), 1))
      .toEqual(source(1, 1, [clear]))
  })

  it('rejects a non-positive-integer target width', () => {
    const board = source(2, 1, [red, green])

    expect(() => downsampleSource(board, 0)).toThrow(/正整数/)
    expect(() => downsampleSource(board, 1.5)).toThrow(/正整数/)
    expect(() => downsampleSource(board, -2)).toThrow(/正整数/)
  })
})

describe('capQuantizedColors', () => {
  const board = source(10, 1, [
    red, red, red, red, green, green, green, brown, brown, [244, 162, 100, 255],
  ])

  it('keeps the top colors and remaps the rest to the nearest kept one', () => {
    const capped = capQuantizedColors(quantizeSource(board), 2)

    expect(capped.palette).toEqual([
      { id: 1, hex: '#F4A261', name: '色 1' },
      { id: 2, hex: '#4A9D62', name: '色 2' },
    ])
    expect(capped.ids.get('#F4A264')).toBe(1)
    expect(capped.ids.get('#45312F')).toBe(2)
  })

  it('returns the same object when the cap is not below the palette size', () => {
    const quantized = quantizeSource(board)

    expect(capQuantizedColors(quantized, 4)).toBe(quantized)
    expect(capQuantizedColors(quantized, 10)).toBe(quantized)
  })

  it('preserves custom names on kept colors', () => {
    const quantized = quantizeSource(board, { colorNames: { '#F4A261': '橘色' } })
    const capped = capQuantizedColors(quantized, 1)

    expect(capped.palette).toEqual([{ id: 1, hex: '#F4A261', name: '橘色' }])
  })

  it('sends an equidistant color to the first kept one', () => {
    const black: RGBA = [0, 0, 0, 255]
    const gray: RGBA = [10, 10, 10, 255]
    const mid: RGBA = [5, 5, 5, 255]
    const tie = source(6, 1, [black, black, black, gray, gray, mid])
    const capped = capQuantizedColors(quantizeSource(tie), 2)

    expect(capped.ids.get('#050505')).toBe(1)
  })

  it('caps after merging near colors', () => {
    const merged = source(5, 1, [red, red, green, green, [244, 162, 100, 255]])
    const capped = capQuantizedColors(quantizeSource(merged, { mergeDistance: 3 }), 1)

    expect(capped.palette).toHaveLength(1)
    expect([...capped.ids.values()].every((id) => id === 1)).toBe(true)
  })

  it('keeps a saturated subject when a gray background floods the count ranking', () => {
    const grays: RGBA[] = [
      [20, 20, 20, 255], [40, 40, 40, 255], [60, 60, 60, 255], [80, 80, 80, 255],
      [100, 100, 100, 255], [120, 120, 120, 255], [140, 140, 140, 255], [160, 160, 160, 255],
    ]
    const reds: RGBA[] = [[160, 40, 40, 255], [200, 50, 50, 255], [224, 64, 64, 255]]
    const pixels: RGBA[] = [
      ...grays.flatMap((gray) => Array.from({ length: 100 }, () => gray)),
      ...reds.flatMap((red) => Array.from({ length: 50 }, () => red)),
    ]
    const capped = capQuantizedColors(quantizeSource(source(pixels.length, 1, pixels)), 6)

    expect(capped.palette.some((color) => color.hex === '#A02828')).toBe(true)
    const neutral = capped.palette.filter((color) => {
      const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(color.hex.slice(at, at + 2), 16))
      return r === g && g === b
    })
    expect(neutral).toHaveLength(4)
  })

  it('rejects a non-positive-integer cap', () => {
    const quantized = quantizeSource(board)

    expect(() => capQuantizedColors(quantized, 0)).toThrow(/正整数/)
    expect(() => capQuantizedColors(quantized, 1.5)).toThrow(/正整数/)
    expect(() => capQuantizedColors(quantized, -1)).toThrow(/正整数/)
  })
})
