// 所有者网寻的 SVG 直接丢进 src/assets/icons/<图标名>.svg 即被 glob 收进来，
// 运行时归一化后内联渲染：颜料统一压成 currentColor（禁用态/沉浸模式才能跟色），
// 并去掉脚本和事件属性。没有对应文件的图标回退到 icons.ts 的占位路径。
import { iconPaths, type IconName } from './icons'

const rawFiles = import.meta.glob('../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export const iconFiles: Partial<Record<IconName, string>> = {}
for (const [path, raw] of Object.entries(rawFiles)) {
  const name = path.split('/').pop()?.replace(/\.svg$/i, '') as IconName | undefined
  if (name && name in iconPaths) iconFiles[name] = raw
}

export type IconSource = { viewBox: string; body: string; crisp: boolean; optical?: boolean }

const FORBIDDEN = 'script,style,foreignObject,iframe,animate,animateTransform,animateMotion,set'
const cache = new Map<string, IconSource>()

export function normalizeIconSvg(raw: string): IconSource {
  const cached = cache.get(raw)
  if (cached) return cached

  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  const root = doc.documentElement
  if (root.querySelector('parsererror')) throw new Error('SVG 解析失败')

  const viewBox = root.getAttribute('viewBox')
    ?? `0 0 ${Number.parseFloat(root.getAttribute('width') ?? '16') || 16} ${Number.parseFloat(root.getAttribute('height') ?? '16') || 16}`

  root.querySelectorAll(FORBIDDEN).forEach((node) => node.remove())
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'style') el.removeAttribute(attr.name)
      else if ((name === 'fill' || name === 'stroke') && attr.value !== 'none') {
        el.setAttribute(name, 'currentColor')
      }
    }
  }

  const serializer = new XMLSerializer()
  const body = [...root.children].map((child) => serializer.serializeToString(child)).join('')
  const source: IconSource = { viewBox, body, crisp: false }
  cache.set(raw, source)
  return source
}

// 六个板块图标上传件的着墨 bbox（1024 viewBox 坐标系，getBBox 实测），
// 用于把 viewBox 裁到图案边缘，消除文件自带留白不均；换文件需重测，
// viewBox 不再是 0 0 1024 1024 时自动退回原图。
const opticalBBoxes: Partial<Record<IconName, readonly [number, number, number, number]>> = {
  materials: [0, 0, 1023.86, 1023.86],
  collections: [28.34, 20.78, 967.32, 967.32],
  search: [30.86, 30.42, 962.49, 963.5],
  studio: [125.4, 130.46, 773.2, 772.19],
  levels: [138.62, 95.99, 746.77, 832.08],
  profile: [168.47, 81.61, 686.83, 814.86],
}

export function resolveIcon(name: IconName): IconSource {
  const raw = iconFiles[name]
  if (raw) {
    const source = normalizeIconSvg(raw)
    const bbox = opticalBBoxes[name]
    if (bbox && source.viewBox === '0 0 1024 1024') {
      return { ...source, viewBox: bbox.join(' '), optical: true }
    }
    return source
  }
  return {
    viewBox: '0 0 16 16',
    body: iconPaths[name].map((d) => `<path d="${d}"></path>`).join(''),
    crisp: true,
  }
}
