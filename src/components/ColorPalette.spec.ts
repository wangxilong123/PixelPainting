import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ColorPalette from './ColorPalette.vue'
import type { PaletteColor } from '../models/level'

const palette: PaletteColor[] = [
  { id: 1, hex: '#F4A261', name: '橘色' },
  { id: 2, hex: '#45312F', name: '深棕' },
  { id: 12, hex: '#4A9D62', name: '茎叶绿' },
]

const cells = [0, 1, 2, 12, 1]
const painted = [0, 1, 0, 0, 0]

function mountPalette(showRemaining?: boolean) {
  return mount(ColorPalette, {
    props: {
      palette,
      cells,
      painted,
      selectedColorId: 1,
      ...(showRemaining === undefined ? {} : { showRemaining }),
    },
  })
}

describe('ColorPalette', () => {
  it('labels every swatch with its color number, including two-digit ids', () => {
    const wrapper = mountPalette()
    expect(wrapper.findAll('.swatch-index').map((node) => node.text())).toEqual(['1', '2', '12'])
    const buttons = wrapper.findAll('.color-swatch')
    expect(buttons[2].attributes('aria-label')).toBe('颜色 12')
    expect(wrapper.findAll('.swatch-name')).toHaveLength(0)
    expect(buttons[0].classes()).toContain('selected')
    expect(buttons[1].classes()).not.toContain('selected')
  })

  it('emits the color id when a swatch is clicked', async () => {
    const wrapper = mountPalette()
    await wrapper.findAll('.color-swatch')[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[2]])
  })

  it('shows remaining counts by default and hides them on request', () => {
    expect(mountPalette().findAll('.swatch-count').map((node) => node.text().trim()))
      .toEqual(['1', '1', '1'])
    expect(mountPalette(false).findAll('.swatch-count')).toHaveLength(0)
  })

  it('disables the swatches whose color has no unfilled cell left', () => {
    const wrapper = mount(ColorPalette, {
      props: { palette, cells, painted: [0, 1, 2, 0, 1], selectedColorId: 12 },
    })
    const buttons = wrapper.findAll('.color-swatch')
    expect(buttons.map((node) => (node.element as HTMLButtonElement).disabled))
      .toEqual([true, true, false])
    expect(wrapper.findAll('.swatch-count').map((node) => node.text().trim()))
      .toEqual(['0', '0', '1'])
  })
})
