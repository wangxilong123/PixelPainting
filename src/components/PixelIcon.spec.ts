import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { iconPaths, type IconName } from './icons'
import PixelIcon from './PixelIcon.vue'

const names = Object.keys(iconPaths) as IconName[]

describe('PixelIcon', () => {
  it('renders one path per subpath with currentColor and crisp edges', () => {
    const wrapper = mount(PixelIcon, { props: { name: 'undo' } })
    const svg = wrapper.get('svg')

    expect(svg.attributes('fill')).toBe('currentColor')
    expect(svg.attributes('shape-rendering')).toBe('crispEdges')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('path').map((path) => path.attributes('d'))).toEqual([...iconPaths.undo])
  })

  it('sizes the svg from the size prop and defaults to 16', () => {
    expect(mount(PixelIcon, { props: { name: 'check' } }).get('svg').attributes('width')).toBe('16')
    const sized = mount(PixelIcon, { props: { name: 'check', size: 12 } }).get('svg')
    expect(sized.attributes('width')).toBe('12')
    expect(sized.attributes('height')).toBe('12')
  })

  it('keeps every glyph inside the 16x16 grid so replacements stay pixel aligned', () => {
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
