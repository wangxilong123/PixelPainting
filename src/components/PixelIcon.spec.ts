import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { iconPaths, type IconName } from './icons'
import { iconFiles, normalizeIconSvg, resolveIcon } from './iconSvg'
import PixelIcon from './PixelIcon.vue'

const names = Object.keys(iconPaths) as IconName[]

describe('PixelIcon', () => {
  it('renders the placeholder paths with currentColor and crisp edges', () => {
    const original = iconFiles['reset-view']
    delete iconFiles['reset-view']
    try {
      const wrapper = mount(PixelIcon, { props: { name: 'reset-view' } })
      const svg = wrapper.get('svg')

      expect(svg.attributes('fill')).toBe('currentColor')
      expect(svg.attributes('shape-rendering')).toBe('crispEdges')
      expect(svg.attributes('aria-hidden')).toBe('true')
      expect(svg.attributes('data-name')).toBe('reset-view')
      expect(wrapper.findAll('path').map((path) => path.attributes('d'))).toEqual([...iconPaths['reset-view']])
    } finally {
      iconFiles['reset-view'] = original
    }
  })

  it('exposes the icon name for the semantic color selectors', () => {
    expect(mount(PixelIcon, { props: { name: 'hint' } }).get('svg').attributes('data-name')).toBe('hint')
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
    const original = iconFiles['reset-view']
    delete iconFiles['reset-view']
    try {
      expect(resolveIcon('reset-view').crisp).toBe(true)
      expect(resolveIcon('reset-view').body).toContain(iconPaths['reset-view'][0])
    } finally {
      iconFiles['reset-view'] = original
    }
  })
})

describe('dropped-in icon files', () => {
  // 26 个键都有正式文件：24 个所有者上传（docs/assets/icons 存原件，grid_on/grid_off 与六个板块图标改名成图标键）
  // + reset-view/clock-off 两个自绘（1024 网格、单 path、fill 走归一化）
  const fileBacked: IconName[] = [
    'arrow-left', 'arrow-right', 'check', 'clock', 'clock-off', 'close', 'compress', 'expand',
    'grid-off', 'grid-on', 'hint', 'lock', 'redo', 'replay', 'reset-view', 'settings',
    'sound-off', 'sound-on', 'undo', 'warn',
    'materials', 'collections', 'studio', 'profile', 'levels', 'search',
  ]
  const boardIcons: IconName[] = ['materials', 'collections', 'studio', 'profile', 'levels', 'search']

  it('wires every file-backed icon to its icon name', () => {
    for (const name of fileBacked) expect(iconFiles[name], name).toBeDefined()
  })

  it('renders file-backed icons as themeable vector paint, not placeholder pixels', () => {
    for (const name of fileBacked) {
      const source = resolveIcon(name)
      expect(source.crisp, name).toBe(false)
      expect(source.body, name).toContain('<path')
      expect(source.body, name).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      expect(source.body, name).not.toContain('<script')
      if (!boardIcons.includes(name)) expect(source.viewBox, name).toBe('0 0 1024 1024')
    }
  })

  it('mounts a file-backed icon at the requested size with the file viewBox', () => {
    const wrapper = mount(PixelIcon, { props: { name: 'hint', size: 20 } })
    const svg = wrapper.get('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 1024 1024')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('shape-rendering')).toBeUndefined()
    expect(wrapper.get('path').attributes('fill')).toBe('currentColor')
  })
})

describe('optical size normalization', () => {
  // 着墨 bbox 实测值（1024 viewBox 坐标系），与 iconSvg.ts 的表互为镜像
  const croppedViewBoxes: Partial<Record<IconName, string>> = {
    materials: '0 0 1023.86 1023.86',
    collections: '28.34 20.78 967.32 967.32',
    search: '30.86 30.42 962.49 963.5',
    studio: '125.4 130.46 773.2 772.19',
    levels: '138.62 95.99 746.77 832.08',
    profile: '168.47 81.61 686.83 814.86',
  }
  const boardIcons = Object.keys(croppedViewBoxes) as IconName[]

  it('crops the six board icons to their measured ink bbox', () => {
    for (const name of boardIcons) {
      const source = resolveIcon(name)
      expect(source.optical, name).toBe(true)
      expect(source.viewBox, name).toBe(croppedViewBoxes[name])
    }
  })

  it('leaves other uploaded icons and placeholders unnormalized', () => {
    for (const name of ['hint', 'check', 'undo'] as IconName[]) {
      const source = resolveIcon(name)
      expect(source.optical, name).toBeFalsy()
      expect(source.viewBox, name).toBe('0 0 1024 1024')
    }
    expect(resolveIcon('reset-view').optical).toBeFalsy()
  })

  it('marks board icons with data-optical so the CSS ratio knob applies', () => {
    const board = mount(PixelIcon, { props: { name: 'profile', size: 20 } })
    const svg = board.get('svg')
    expect(svg.attributes('data-optical')).toBe('')
    expect(svg.attributes('viewBox')).toBe('168.47 81.61 686.83 814.86')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('height')).toBe('20')

    const plain = mount(PixelIcon, { props: { name: 'hint', size: 20 } })
    expect(plain.get('svg').attributes('data-optical')).toBeUndefined()
  })

  it('falls back to the file viewBox when a replaced file no longer uses the 1024 grid', () => {
    const original = iconFiles.materials
    iconFiles.materials = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"></path></svg>'
    try {
      const source = resolveIcon('materials')
      expect(source.optical).toBeFalsy()
      expect(source.viewBox).toBe('0 0 24 24')
    } finally {
      iconFiles.materials = original
    }
  })
})
