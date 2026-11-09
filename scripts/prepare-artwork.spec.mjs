// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'prepare-artwork.mjs')
const white = [255, 255, 255, 255]
const red = [220, 30, 30, 255]

let workDir
let used = 0

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'prepare-artwork-'))
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function nextName() {
  used += 1
  return `art-${used}`
}

// paint(x, y) 返回 RGBA；默认白底，subject 列出要涂红的坐标
function writePng(name, width, height, paint) {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const pixel = paint(x, y)
      for (let channel = 0; channel < 4; channel += 1) png.data[offset + channel] = pixel[channel]
    }
  }
  const path = join(workDir, `${name}.png`)
  writeFileSync(path, PNG.sync.write(png))
  return path
}

function inBlock(x, y, left, top, size) {
  return x >= left && x < left + size && y >= top && y < top + size
}

function run(args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' })
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

function readGrid(path) {
  const png = PNG.sync.read(readFileSync(path))
  const cells = []
  for (let index = 0; index < png.width * png.height; index += 1) {
    const offset = index * 4
    cells.push(png.data[offset + 3] === 0
      ? null
      : `#${[0, 1, 2].map((c) => png.data[offset + c].toString(16).padStart(2, '0')).join('')}`)
  }
  return { width: png.width, height: png.height, cells }
}

describe('prepare-artwork', () => {
  it('floods the background away and keeps the subject as one pixel per cell', () => {
    const name = nextName()
    const png = writePng(name, 8, 8, (x, y) => (inBlock(x, y, 2, 2, 4) ? red : white))
    const out = join(workDir, `${name}-4.png`)
    const result = run([png, '--width', '4', '--out', out])

    expect(result.code).toBe(0)
    expect(result.output).toContain('原图 8×8 → 格子 4×4，可交互格 4，颜色 1 种')
    expect(readGrid(out)).toEqual({
      width: 4,
      height: 4,
      cells: [
        null, null, null, null,
        null, '#dc1e1e', '#dc1e1e', null,
        null, '#dc1e1e', '#dc1e1e', null,
        null, null, null, null,
      ],
    })
  })

  it('treats a near-background subject as background only within the tolerance', () => {
    // 浅灰主体和白底差 30：默认容差 24 保留，放到 40 就被当背景抠掉
    const pale = [245, 245, 245, 255]
    const paint = (x, y) => (inBlock(x, y, 2, 2, 4) ? pale : white)

    const kept = nextName()
    const keptOut = join(workDir, `${kept}-4.png`)
    const strict = run([writePng(kept, 8, 8, paint), '--width', '4', '--out', keptOut])
    expect(strict.code).toBe(0)
    expect(readGrid(keptOut).cells.filter((hex) => hex !== null)).toHaveLength(4)

    const eaten = nextName()
    const result = run([writePng(eaten, 8, 8, paint), '--width', '4',
      '--out', join(workDir, `${eaten}-4.png`), '--bg-tolerance', '40'])
    expect(result.code).toBe(1)
    expect(result.output).toContain('一格都不剩')
  })

  it('keeps a half-covered cell only when the background ratio allows it', () => {
    // 4 个源像素里只有 2 个是主体，背景占比正好 0.5
    const paint = (x, y) => ((x === 2 && y === 2) || (x === 3 && y === 3) ? red : white)

    const dropped = nextName()
    const result = run([writePng(dropped, 8, 8, paint), '--width', '4',
      '--out', join(workDir, `${dropped}-4.png`)])
    expect(result.code).toBe(1)
    expect(result.output).toContain('一格都不剩')

    const kept = nextName()
    const keptOut = join(workDir, `${kept}-4.png`)
    const lenient = run([writePng(kept, 8, 8, paint), '--width', '4',
      '--out', keptOut, '--bg-ratio', '0.6'])
    expect(lenient.code).toBe(0)
    expect(readGrid(keptOut).cells.filter((hex) => hex !== null)).toEqual(['#dc1e1e'])
  })

  it('defaults the output path next to the source and scales the height by aspect', () => {
    const name = nextName()
    const png = writePng(name, 8, 4, (x, y) => (inBlock(x, y, 2, 0, 2) ? red : white))
    const result = run([png, '--width', '4'])

    expect(result.code).toBe(0)
    const grid = readGrid(join(workDir, `${name}-4.png`))
    expect([grid.width, grid.height]).toEqual([4, 2])
    expect(grid.cells.filter((hex) => hex !== null)).toEqual(['#dc1e1e'])
    expect(result.output).toContain('格子 4×2')
  })

  it('warns when the subject reaches a corner', () => {
    const name = nextName()
    const png = writePng(name, 8, 8, (x, y) => (x < 4 && y < 4 ? red : white))
    const out = join(workDir, `${name}-4.png`)
    const result = run([png, '--width', '4', '--out', out])

    expect(result.code).toBe(0)
    expect(result.output).toContain('四个角上有图案')
  })

  it('fails when the whole image is background', () => {
    const name = nextName()
    const result = run([writePng(name, 8, 8, () => white), '--width', '4',
      '--out', join(workDir, `${name}-4.png`)])

    expect(result.code).toBe(1)
    expect(result.output).toContain('一格都不剩')
  })

  it.each([
    [['--width', '0'], '--width 需要 1 到 128 的整数'],
    [['--width', '129'], '--width 需要 1 到 128 的整数'],
    [['--width', 'abc'], '--width 需要 1 到 128 的整数'],
    [['--width', '4', '--bg-tolerance=-2'], '--bg-tolerance 需要非负整数'],
    [['--width', '4', '--bg-ratio', '0'], '--bg-ratio 需要 0 到 1 之间'],
    [['--width', '4', '--bg-ratio', '1.5'], '--bg-ratio 需要 0 到 1 之间'],
  ])('rejects %j', (flags, message) => {
    const name = nextName()
    const result = run([writePng(name, 8, 8, () => white), ...flags])

    expect(result.code).toBe(1)
    expect(result.output).toContain(message)
  })

  it('requires a png path and --width', () => {
    expect(run([]).output).toContain('需要一个 PNG 路径')
    const name = nextName()
    expect(run([writePng(name, 4, 4, () => white)]).output).toContain('缺少 --width')
  })
})
