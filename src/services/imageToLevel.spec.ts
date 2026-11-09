import { describe, expect, it } from 'vitest'
import { imageToLevel, quantizePalette, type PixelSource } from './imageToLevel'

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
    expect(level.tags).toBeUndefined()
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
})
