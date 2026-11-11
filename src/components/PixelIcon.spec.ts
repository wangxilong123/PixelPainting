import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { iconPaths, type IconName } from './icons'
import { iconFiles, normalizeIconSvg, resolveIcon } from './iconSvg'
import PixelIcon from './PixelIcon.vue'

const names = Object.keys(iconPaths) as IconName[]

describe('PixelIcon', () => {
  it('renders the placeholder paths with currentColor and crisp edges', () => {
    const wrapper = mount(PixelIcon, { props: { name: 'reset-view' } })
    const svg = wrapper.get('svg')

    expect(svg.attributes('fill')).toBe('currentColor')
    expect(svg.attributes('shape-rendering')).toBe('crispEdges')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('path').map((path) => path.attributes('d'))).toEqual([...iconPaths['reset-view']])
  })

  it('sizes the svg from the size prop and defaults to 16', () => {
    expect(mount(PixelIcon, { props: { name: 'check' } }).get('svg').attributes('width')).toBe('16')
    const sized = mount(PixelIcon, { props: { name: 'check', size: 12 } }).get('svg')
    expect(sized.attributes('width')).toBe('12')
    expect(sized.attributes('height')).toBe('12')
  })

  it('keeps every placeholder glyph inside the 16x16 grid', () => {
    for (const name of names) {
      for (const d of iconPaths[name]) {
        expect(d.length, name).toBeGreaterThan(0)
        for (const value of d.match(/-?\d+(\.\d+)?/g) ?? []) {
          expect(Number(value), `${name} ${d}`).toBeGreaterThanOrEqual(0)
          expect(Number(value), `${name} ${d}`).toBeLessThanOrEqual(16)
        }
      }
    }
  })
})

describe('normalizeIconSvg', () => {
  it('collapses every paint to currentColor so icons follow the theme', () => {
    const source = normalizeIconSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="#FF0000" d="M2 2h20v20H2z"></path>
      <path stroke="#00FF00" stroke-width="2" fill="none" d="M4 4l16 16"></path>
      <path fill="none" d="M0 0h1v1H0z"></path>
    </svg>`)

    expect(source.viewBox).toBe('0 0 24 24')
    expect(source.crisp).toBe(false)
    expect(source.body).not.toContain('#FF0000')
    expect(source.body).not.toContain('#00FF00')
    expect(source.body.match(/currentColor/g)).toHaveLength(2)
    expect(source.body).toContain('fill="none"')
  })

  it('drops scripts, event handlers and inline styles from downloaded files', () => {
    const source = normalizeIconSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" onload="alert(1)">
      <script>fetch('https://example.com')</script>
      <path style="fill:red" onclick="alert(2)" fill="#000" d="M1 1h14v14H1z"></path>
    </svg>`)

    expect(source.body).not.toContain('script')
    expect(source.body).not.toContain('onload')
    expect(source.body).not.toContain('onclick')
    expect(source.body).not.toContain('style=')
    expect(source.body).toContain('fill="currentColor"')
  })

  it('derives a viewBox from width and height when the file has none', () => {
    const source = normalizeIconSvg('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M0 0h32v32H0z"></path></svg>')
    expect(source.viewBox).toBe('0 0 32 32')
  })

  it('falls back to the placeholder paths while no file has been dropped in', () => {
    expect(resolveIcon('reset-view').crisp).toBe(true)
    expect(resolveIcon('reset-view').body).toContain(iconPaths['reset-view'][0])
  })
})

describe('dropped-in icon files', () => {
  // 所有者上传的 18 个文件（docs/assets/icons 原件拷贝，grid_on/grid_off 改名连字符）
  const uploaded: IconName[] = [
    'arrow-left', 'arrow-right', 'check', 'clock', 'close', 'compress', 'expand',
    'grid-off', 'grid-on', 'hint', 'lock', 'redo', 'replay', 'settings',
    'sound-off', 'sound-on', 'undo', 'warn',
  ]

  it('wires every uploaded file to its icon name', () => {
    for (const name of uploaded) expect(iconFiles[name], name).toBeDefined()
  })

  it('renders uploaded files as themeable vector paint, not placeholder pixels', () => {
    for (const name of uploaded) {
      const source = resolveIcon(name)
      expect(source.crisp, name).toBe(false)
      expect(source.viewBox, name).toBe('0 0 1024 1024')
      expect(source.body, name).toContain('<path')
      expect(source.body, name).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      expect(source.body, name).not.toContain('<script')
    }
  })

  it('mounts an uploaded icon at the requested size with the file viewBox', () => {
    const wrapper = mount(PixelIcon, { props: { name: 'hint', size: 20 } })
    const svg = wrapper.get('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 1024 1024')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('shape-rendering')).toBeUndefined()
    expect(wrapper.get('path').attributes('fill')).toBe('currentColor')
  })
})
