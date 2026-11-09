#!/usr/bin/env node
// 把所有者投放的像素 PNG 转成关卡文件，并重建 src/data/levels/index.ts。
// 只导入没有相对依赖的模块：Node 不解析省略扩展名的相对导入，levelService 那条链走不通。
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { PNG } from 'pngjs'
import { levelCategories } from '../src/data/categories.ts'
import { imageToLevel } from '../src/services/imageToLevel.ts'

const maxDimension = 128
const chunkThreshold = 64
const colorWarningThreshold = 12
const alphaThreshold = 128

const usage = `用法：node scripts/convert-level.mjs <png> --title <名称> --category <分类> --difficulty <1|2|3>
      [--id <关卡ID>] [--order <序号>] [--tags <a,b>] [--name <#RRGGBB=名称>]...
      [--thumbnail <透明底PNG>] [--max-colors <n>] [--out src/data/levels] [--dry-run]
      [--parts <2|3>] [--merge-distance <n>]
分类可选值：${levelCategories.map((entry) => entry.id).join('、')}
超过 ${chunkThreshold} 格的图必须带 --parts 分块，上限 ${maxDimension}；带 --parts 时自动产出整图缩略图`

function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function exportName(id) {
  return id.replace(/[-_]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
}

function fail(message) {
  throw new Error(message)
}

function parseArguments(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      title: { type: 'string' },
      category: { type: 'string' },
      difficulty: { type: 'string' },
      id: { type: 'string' },
      order: { type: 'string' },
      tags: { type: 'string' },
      thumbnail: { type: 'string' },
      out: { type: 'string', default: 'src/data/levels' },
      'max-colors': { type: 'string' },
      parts: { type: 'string' },
      'merge-distance': { type: 'string' },
      name: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
    },
  })

  if (positionals.length !== 1) fail(`需要一个 PNG 路径\n${usage}`)
  for (const flag of ['title', 'category', 'difficulty']) {
    if (!values[flag]) fail(`缺少 --${flag}\n${usage}`)
  }

  const difficulty = Number(values.difficulty)
  if (![1, 2, 3].includes(difficulty)) fail(`--difficulty 只能是 1、2 或 3，收到 ${values.difficulty}`)

  const category = values.category
  if (!levelCategories.some((entry) => entry.id === category)) {
    fail(`--category ${category} 不在注册表里，可选值：${levelCategories.map((e) => e.id).join('、')}`)
  }

  const colorNames = {}
  for (const entry of values.name ?? []) {
    const split = entry.indexOf('=')
    if (split <= 0) fail(`--name 需要 #RRGGBB=名称 的格式，收到 ${entry}`)
    colorNames[entry.slice(0, split).trim()] = entry.slice(split + 1).trim()
  }

  const id = values.id ?? basename(positionals[0]).replace(/\.png$/i, '')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`关卡 ID ${id} 只能用小写字母、数字和连字符`)

  let parts
  if (values.parts !== undefined) {
    const split = Number(values.parts)
    if (![2, 3].includes(split)) fail(`--parts 只能是 2 或 3（n×n），收到 ${values.parts}`)
    parts = { cols: split, rows: split }
  }

  let mergeDistance
  if (values['merge-distance'] !== undefined) {
    mergeDistance = Number(values['merge-distance'])
    if (!Number.isInteger(mergeDistance) || mergeDistance < 0) {
      fail(`--merge-distance 需要非负整数，收到 ${values['merge-distance']}`)
    }
  }

  return {
    pngPath: positionals[0],
    outDir: resolve(values.out),
    dryRun: values['dry-run'],
    thumbnail: values.thumbnail,
    parts,
    mergeDistance,
    maxColors: values['max-colors'] === undefined ? undefined : Number(values['max-colors']),
    meta: {
      id,
      title: values.title,
      category,
      difficulty,
      order: values.order === undefined ? undefined : Number(values.order),
      tags: values.tags ? values.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
      parts,
      colorNames,
    },
  }
}

function readSource(pngPath, chunked) {
  let png
  try {
    png = PNG.sync.read(readFileSync(pngPath))
  } catch (error) {
    fail(`PNG 解码失败：${error.message}`)
  }

  const { width, height, data } = png
  if (width < 1 || height < 1) fail(`图片尺寸非法：${width}×${height}`)
  if (width > maxDimension || height > maxDimension) {
    fail(`图片尺寸 ${width}×${height} 超过上限 ${maxDimension}，格子太多玩不动`)
  }
  if (!chunked && (width > chunkThreshold || height > chunkThreshold)) {
    fail(`图片尺寸 ${width}×${height} 超过 ${chunkThreshold} 格，整幅一屏放不下，请加 --parts 2 或 --parts 3 分块`)
  }

  const corners = [0, width - 1, (height - 1) * width, height * width - 1]
  for (const index of corners) {
    if (data[index * 4 + 3] >= alphaThreshold) {
      fail('四角必须透明，当前背景不透明。请用透明背景重新导出')
    }
  }

  let semiTransparent = 0
  for (let index = 0; index < width * height; index += 1) {
    const alpha = data[index * 4 + 3]
    if (alpha > 0 && alpha < 255) semiTransparent += 1
  }
  if (semiTransparent > 0) {
    fail(`发现 ${semiTransparent} 个半透明像素，多半是抗锯齿边缘。请关闭抗锯齿后重新导出`)
  }

  return { width, height, data: Uint8ClampedArray.from(data) }
}

// 缩略图只要求四角透明：卡片预览是透明底，带背景色的图会露出一块方框
function validateThumbnail(pngPath) {
  let png
  try {
    png = PNG.sync.read(readFileSync(pngPath))
  } catch (error) {
    fail(`缩略图 PNG 解码失败：${error.message}`)
  }
  const { width, height, data } = png
  const corners = [0, width - 1, (height - 1) * width, height * width - 1]
  for (const index of corners) {
    if (data[index * 4 + 3] >= alphaThreshold) fail(`缩略图 ${pngPath} 四角必须透明，当前带背景色`)
  }
  return { width, height }
}

function renderLevelFile(level, thumbnail) {
  const fields = [
    `  id: ${quote(level.id)},`,
    `  title: ${quote(level.title)},`,
    `  category: ${quote(level.category)},`,
    `  difficulty: ${level.difficulty},`,
    `  width: ${level.width},`,
    `  height: ${level.height},`,
  ]
  if (level.order !== undefined) fields.push(`  order: ${level.order},`)
  if (level.tags !== undefined) fields.push(`  tags: [${level.tags.map(quote).join(', ')}],`)
  fields.push(`  source: ${quote(level.source)},`)
  if (level.parts) fields.push(`  parts: { cols: ${level.parts.cols}, rows: ${level.parts.rows} },`)
  if (thumbnail) fields.push(`  thumbnail: ${exportName(level.id)}Thumbnail,`)
  fields.push('  palette: [')
  for (const color of level.palette) {
    fields.push(`    { id: ${color.id}, hex: ${quote(color.hex)}, name: ${quote(color.name)} },`)
  }
  fields.push('  ],')
  fields.push('  cells: [')
  for (let row = 0; row < level.height; row += 1) {
    const slice = level.cells.slice(row * level.width, (row + 1) * level.width)
    fields.push(`    ${slice.join(', ')},`)
  }
  fields.push('  ],')

  const header = thumbnail
    ? `import ${exportName(level.id)}Thumbnail from './${level.id}.png'\nimport type { Level } from '../../models/level'`
    : `import type { Level } from '../../models/level'`

  return `${header}

export const ${exportName(level.id)}: Level = {
${fields.join('\n')}
}
`
}

// 分块关卡的格子数上万，选关卡片不能再用 DOM 格子画，按一格一像素产出整图缩略 PNG
function renderGridPng(level) {
  const png = new PNG({ width: level.width, height: level.height })
  const channels = new Map(level.palette.map((color) => [color.id, [
    Number.parseInt(color.hex.slice(1, 3), 16),
    Number.parseInt(color.hex.slice(3, 5), 16),
    Number.parseInt(color.hex.slice(5, 7), 16),
  ]]))

  for (const [index, colorId] of level.cells.entries()) {
    const offset = index * 4
    const rgb = channels.get(colorId)
    if (!rgb) {
      png.data[offset + 3] = 0
      continue
    }
    png.data[offset] = rgb[0]
    png.data[offset + 1] = rgb[1]
    png.data[offset + 2] = rgb[2]
    png.data[offset + 3] = 255
  }
  return PNG.sync.write(png)
}

function renderIndex(outDir) {
  const files = readdirSync(outDir)
    .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
    .sort()
  const imports = files.map((name) => {
    const id = name.replace(/\.ts$/, '')
    return `import { ${exportName(id)} } from './${id}'`
  })
  const registered = files.map((name) => exportName(name.replace(/\.ts$/, '')))

  return `import type { Level } from '../../models/level'
${imports.join('\n')}

export const presetLevels: readonly Level[] = [${registered.join(', ')}]
`
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const source = readSource(options.pngPath, options.parts !== undefined)
  const level = imageToLevel(source, {
    ...options.meta,
    maxColors: options.maxColors,
    mergeDistance: options.mergeDistance,
  })
  // 显式给的缩略图优先；带 --parts 时按格子自动产出一张，卡片不用为上万个格子建 DOM
  const autoThumbnail = options.parts !== undefined && options.thumbnail === undefined
  const thumbnail = options.thumbnail
    ? validateThumbnail(options.thumbnail)
    : autoThumbnail ? { width: level.width, height: level.height } : undefined
  const thumbnailPath = join(options.outDir, `${level.id}.png`)

  if (level.palette.length > colorWarningThreshold) {
    console.warn(`提示：这张图有 ${level.palette.length} 种颜色，编号会缩到 9px，考虑减色后再投`)
  }

  const interactive = level.cells.filter((color) => color !== 0).length
  const levelPath = join(options.outDir, `${level.id}.ts`)
  const body = renderLevelFile(level, thumbnail)

  if (options.dryRun) {
    console.log(body)
  } else {
    writeFileSync(levelPath, body, 'utf8')
    writeFileSync(join(options.outDir, 'index.ts'), renderIndex(options.outDir), 'utf8')
    if (options.thumbnail) copyFileSync(options.thumbnail, thumbnailPath)
    else if (autoThumbnail) writeFileSync(thumbnailPath, renderGridPng(level))
  }

  console.log(`${options.dryRun ? '试跑' : '已写入'} ${level.id} ${level.title}`)
  console.log(`尺寸 ${level.width}×${level.height}，可交互格 ${interactive}，颜色 ${level.palette.length} 种`)
  if (level.parts) console.log(`分块 ${level.parts.cols}×${level.parts.rows}`)
  if (thumbnail) {
    const origin = autoThumbnail ? '（按格子自动产出）' : ''
    console.log(`缩略图 ${thumbnail.width}×${thumbnail.height}${origin}${options.dryRun ? '（试跑不写文件）' : ''}`)
  }
  if (!options.dryRun) console.log(`文件 ${levelPath}`)
  console.log('接下来跑 npm run test:unit 和 npm run build，再目视核对图案')
}

try {
  main()
} catch (error) {
  console.error(`错误：${error.message}`)
  process.exitCode = 1
}
