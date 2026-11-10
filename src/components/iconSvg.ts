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

export type IconSource = { viewBox: string; body: string; crisp: boolean }

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

export function resolveIcon(name: IconName): IconSource {
  const raw = iconFiles[name]
  if (raw) return normalizeIconSvg(raw)
  return {
    viewBox: '0 0 16 16',
    body: iconPaths[name].map((d) => `<path d="${d}"></path>`).join(''),
    crisp: true,
  }
}
