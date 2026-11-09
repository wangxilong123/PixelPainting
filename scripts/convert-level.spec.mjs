// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'convert-level.mjs')
const clear = [0, 0, 0, 0]
const red = [244, 162, 97, 255]
const nearRed = [244, 162, 100, 255]
const green = [74, 157, 98, 255]

let workDir
let used = 0

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'convert-level-'))
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function outDir() {
  const dir = join(workDir, `out-${used += 1}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writePng(name, width, height, paint) {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const pixel = paint(x, y)
      for (let channel = 0; channel < 4; channel += 1) png.data[offset + channel] = pixel[channel]
    }
  }
  const path = join(workDir, name)
  writeFileSync(path, PNG.sync.write(png))
  return path
}

// 边框一圈透明，四角校验才过得去，内部按列交替上色
function framed(width, height, inner = (x) => (x % 2 === 0 ? red : green)) {
  return (x, y) => {
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
    return edge ? clear : inner(x, y)
  }
}

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, output: stdout }
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

function convert(pngPath, out, extra = []) {
  return run([pngPath, '--title', '试投图', '--category', 'other', '--difficulty', '2',
    '--out', out, ...extra])
}

describe('convert-level size limits', () => {
  it('rejects an image above 64 cells and points at --parts', () => {
    const png = writePng('over-64.png', 65, 65, framed(65, 65))
    const result = convert(png, outDir())

    expect(result.code).toBe(1)
    expect(result.output).toContain('超过 64 格')
    expect(result.output).toContain('--parts 2 或 --parts 3')
  })

  it('rejects anything above 128 even when chunked', () => {
    const png = writePng('over-128.png', 129, 100, framed(129, 100))
    const result = convert(png, outDir(), ['--parts', '3'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('超过上限 128')
  })

  it.each(['1', '4', '2x2', 'abc'])('rejects --parts %s', (value) => {
    const png = writePng('small.png', 8, 8, framed(8, 8))
    const result = convert(png, outDir(), ['--parts', value])

    expect(result.code).toBe(1)
    expect(result.output).toContain('--parts 只能是 2 或 3')
  })

  it.each(['1.5', 'abc'])('rejects --merge-distance %s', (value) => {
    const png = writePng('merge-invalid.png', 8, 8, framed(8, 8))
    const result = convert(png, outDir(), ['--merge-distance', value])

    expect(result.code).toBe(1)
    expect(result.output).toContain('--merge-distance 需要非负整数')
  })

  it('rejects a negative --merge-distance', () => {
    const png = writePng('merge-negative.png', 8, 8, framed(8, 8))
    // 负数得写成 --merge-distance=-1，否则 parseArgs 把它当成缺参数
    const result = convert(png, outDir(), ['--merge-distance=-1'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('--merge-distance 需要非负整数')
  })
})

describe('convert-level chunked output', () => {
  it('writes the part split and renders a thumbnail from the grid', () => {
    const out = outDir()
    const png = writePng('chunked.png', 96, 72, framed(96, 72))
    const result = convert(png, out, ['--parts', '3', '--id', 'level-900'])

    expect(result.code).toBe(0)
    expect(result.output).toContain('分块 3×3')
    expect(result.output).toContain('缩略图 96×72（按格子自动产出）')

    const body = readFileSync(join(out, 'level-900.ts'), 'utf8')
    expect(body).toContain('parts: { cols: 3, rows: 3 },')
    expect(body).toContain("import level900Thumbnail from './level-900.png'")
    expect(body).toContain('thumbnail: level900Thumbnail,')

    const thumb = PNG.sync.read(readFileSync(join(out, 'level-900.png')))
    expect([thumb.width, thumb.height]).toEqual([96, 72])
    expect(thumb.data[3]).toBe(0)
    const inner = (1 * 96 + 1) * 4
    expect([...thumb.data.slice(inner, inner + 4)]).toEqual(green)
  })

  it('prefers an explicit --thumbnail over the generated one', () => {
    const out = outDir()
    const png = writePng('explicit.png', 70, 70, framed(70, 70))
    const thumbnail = writePng('explicit-thumb.png', 4, 4, framed(4, 4))
    const result = convert(png, out, ['--parts', '2', '--id', 'level-901', '--thumbnail', thumbnail])

    expect(result.code).toBe(0)
    expect(result.output).not.toContain('按格子自动产出')
    const copied = PNG.sync.read(readFileSync(join(out, 'level-901.png')))
    expect([copied.width, copied.height]).toEqual([4, 4])
  })

  it('leaves out the part fields for an unchunked drop', () => {
    const out = outDir()
    const png = writePng('plain.png', 8, 8, framed(8, 8))
    const result = convert(png, out, ['--id', 'level-902'])

    expect(result.code).toBe(0)
    const body = readFileSync(join(out, 'level-902.ts'), 'utf8')
    expect(body).not.toContain('parts:')
    expect(body).not.toContain('thumbnail:')
  })
})

describe('convert-level merge distance', () => {
  const paint = (x, y) => {
    const edge = x === 0 || y === 0 || x === 7 || y === 7
    return edge ? clear : (x % 2 === 0 ? red : nearRed)
  }

  it('keeps near colors apart by default and merges them on request', () => {
    const png = writePng('merge.png', 8, 8, paint)

    expect(convert(png, outDir(), ['--id', 'level-903', '--dry-run']).output)
      .toContain('颜色 2 种')
    const merged = convert(png, outDir(),
      ['--id', 'level-903', '--merge-distance', '3', '--dry-run'])
    expect(merged.output).toContain('颜色 1 种')
    expect(merged.output).toContain('试跑')
  })
})
