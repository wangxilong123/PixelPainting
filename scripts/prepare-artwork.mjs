#!/usr/bin/env node
// 把插画原图清理成可以直接投放的格子图：抠掉背景、降到目标格数、硬边无半透明。
// 转换脚本不会替投放图降采样，所以放大插值出来的成品图要先过这一步。
// 只依赖 pngjs，不导入 src 下的模块。
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { PNG } from 'pngjs'

const maxDimension = 128
const defaultTolerance = 24

const usage = `用法：node scripts/prepare-artwork.mjs <png> --width <格数> [--out <png>]
      [--bg-tolerance <n>] [--bg-ratio <0..1>]
--width        目标格子宽，高按原图比例折算，1 到 ${maxDimension}
--out          输出路径，默认原图目录下 <名字>-<格数>.png
--bg-tolerance 从边框泛洪抠背景时，相邻像素三通道绝对差之和不超过这个值就算同一块背景，默认 ${defaultTolerance}
--bg-ratio     格子里背景像素占比达到这个值就整格透明，默认 0.5`

function fail(message) {
  throw new Error(message)
}

function parseArguments(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      width: { type: 'string' },
      out: { type: 'string' },
      'bg-tolerance': { type: 'string' },
      'bg-ratio': { type: 'string' },
    },
  })

  if (positionals.length !== 1) fail(`需要一个 PNG 路径\n${usage}`)
  if (values.width === undefined) fail(`缺少 --width\n${usage}`)

  const width = Number(values.width)
  if (!Number.isInteger(width) || width < 1 || width > maxDimension) {
    fail(`--width 需要 1 到 ${maxDimension} 的整数，收到 ${values.width}`)
  }

  const tolerance = values['bg-tolerance'] === undefined
    ? defaultTolerance
    : Number(values['bg-tolerance'])
  if (!Number.isInteger(tolerance) || tolerance < 0) {
    fail(`--bg-tolerance 需要非负整数，收到 ${values['bg-tolerance']}`)
  }

  const ratio = values['bg-ratio'] === undefined ? 0.5 : Number(values['bg-ratio'])
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
    fail(`--bg-ratio 需要 0 到 1 之间（不含 0），收到 ${values['bg-ratio']}`)
  }

  const pngPath = resolve(positionals[0])
  const stem = basename(pngPath).replace(/\.png$/i, '')
  return {
    pngPath,
    outPath: resolve(values.out ?? join(dirname(pngPath), `${stem}-${width}.png`)),
    gridWidth: width,
    tolerance,
    ratio,
  }
}

function hexAt(data, offset) {
  let hex = '#'
  for (let channel = 0; channel < 3; channel += 1) {
    hex += data[offset + channel].toString(16).padStart(2, '0').toUpperCase()
  }
  return hex
}

function distanceToHex(data, offset, hex) {
  let total = 0
  for (let channel = 0; channel < 3; channel += 1) {
    const value = Number.parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16)
    total += Math.abs(data[offset + channel] - value)
  }
  return total
}

// 边框上最常见的颜色就是背景色，同票按十六进制升序，保证同一张图每次结果一致
function borderColor(data, width, height) {
  const counts = new Map()
  const bump = (index) => {
    if (data[index * 4 + 3] === 0) return
    const hex = hexAt(data, index * 4)
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  for (let x = 0; x < width; x += 1) {
    bump(x)
    bump((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    bump(y * width)
    bump(y * width + width - 1)
  }
  if (counts.size === 0) return null
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0]
}

// 只从接近背景色的边框像素往里泛洪，生长条件也是"和背景色够近"而不是"和邻居够近"，
// 这样主体贴边或者背景带渐变时都不会被一路吃进去
function markBackground(data, width, height, tolerance) {
  const background = new Uint8Array(width * height)
  const queue = []
  const seed = (index) => {
    if (background[index]) return
    background[index] = 1
    queue.push(index)
  }

  for (let index = 0; index < width * height; index += 1) {
    if (data[index * 4 + 3] === 0) seed(index)
  }

  const hex = borderColor(data, width, height)
  if (hex === null) return background

  const edges = []
  for (let x = 0; x < width; x += 1) edges.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y += 1) edges.push(y * width, y * width + width - 1)
  for (const index of edges) {
    if (data[index * 4 + 3] !== 0 && distanceToHex(data, index * 4, hex) <= tolerance) seed(index)
  }

  while (queue.length > 0) {
    const index = queue.pop()
    const x = index % width
    const y = (index - x) / width
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextX = x + dx
      const nextY = y + dy
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue
      const next = nextY * width + nextX
      if (background[next] || data[next * 4 + 3] === 0) continue
      if (distanceToHex(data, next * 4, hex) <= tolerance) seed(next)
    }
  }
  return background
}

function cellRange(total, cell, count) {
  return [Math.floor(cell * total / count), Math.floor((cell + 1) * total / count)]
}

// 一格取格子内非背景像素的众数色，同票按十六进制升序，保证同一张图每次结果一致
function sampleGrid(source, background, gridWidth, gridHeight, ratio) {
  const { width, height, data } = source
  const cells = new Array(gridWidth * gridHeight).fill(null)
  let opaque = 0

  for (let cellY = 0; cellY < gridHeight; cellY += 1) {
    const [top, bottom] = cellRange(height, cellY, gridHeight)
    for (let cellX = 0; cellX < gridWidth; cellX += 1) {
      const [left, right] = cellRange(width, cellX, gridWidth)
      const counts = new Map()
      let total = 0
      let covered = 0

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = y * width + x
          total += 1
          if (background[index]) continue
          covered += 1
          const hex = hexAt(data, index * 4)
          counts.set(hex, (counts.get(hex) ?? 0) + 1)
        }
      }

      if (total === 0 || counts.size === 0 || (total - covered) / total >= ratio) continue
      const hex = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0]
      cells[cellY * gridWidth + cellX] = hex
      opaque += 1
    }
  }
  return { cells, opaque }
}

function writeGridPng(outPath, gridWidth, gridHeight, cells) {
  const png = new PNG({ width: gridWidth, height: gridHeight })
  for (const [index, hex] of cells.entries()) {
    const offset = index * 4
    if (hex === null) {
      png.data[offset + 3] = 0
      continue
    }
    for (let channel = 0; channel < 3; channel += 1) {
      png.data[offset + channel] = Number.parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16)
    }
    png.data[offset + 3] = 255
  }
  writeFileSync(outPath, PNG.sync.write(png))
}

function main() {
  const options = parseArguments(process.argv.slice(2))

  let source
  try {
    source = PNG.sync.read(readFileSync(options.pngPath))
  } catch (error) {
    fail(`PNG 解码失败：${error.message}`)
  }
  if (source.width < 1 || source.height < 1) fail(`图片尺寸非法：${source.width}×${source.height}`)

  const gridWidth = options.gridWidth
  const gridHeight = Math.max(1, Math.round(source.height * gridWidth / source.width))
  const background = markBackground(source.data, source.width, source.height, options.tolerance)
  const { cells, opaque } = sampleGrid(source, background, gridWidth, gridHeight, options.ratio)

  if (opaque === 0) fail('清理之后一格都不剩，把 --bg-tolerance 调小或 --bg-ratio 调大再试')
  const corners = [0, gridWidth - 1, (gridHeight - 1) * gridWidth, gridWidth * gridHeight - 1]
  if (corners.some((index) => cells[index] !== null)) {
    console.warn('提醒：四个角上有图案，转换脚本会拒绝，主体得离边框远一点')
  }

  const colors = new Set(cells.filter((hex) => hex !== null))
  writeGridPng(options.outPath, gridWidth, gridHeight, cells)

  console.log(`已写入 ${options.outPath}`)
  console.log(`原图 ${source.width}×${source.height} → 格子 ${gridWidth}×${gridHeight}，可交互格 ${opaque}，颜色 ${colors.size} 种`)
  console.log('接下来投给 convert-level.mjs，格子图本身就可以当 --thumbnail')
}

try {
  main()
} catch (error) {
  console.error(`错误：${error.message}`)
  process.exitCode = 1
}
