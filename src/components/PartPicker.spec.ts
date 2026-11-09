import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PartPicker from './PartPicker.vue'
import type { Level } from '../models/level'
import { getPartRects } from '../services/levelService'

const level: Level = {
  id: 'chunked',
  title: '分块',
  category: 'animal',
  difficulty: 3,
  width: 4,
  height: 4,
  palette: [
    { id: 1, hex: '#AABBCC', name: '蓝灰' },
    { id: 2, hex: '#FFEEDD', name: '米色' },
    { id: 3, hex: '#4A9D62', name: '绿' },
  ],
  cells: [1, 2, 0, 3, 2, 1, 3, 0, 0, 3, 1, 2, 3, 0, 2, 1],
  parts: { cols: 2, rows: 2 },
}

// 第一块涂满，第二块涂了 3 号色那一格
const painted = [1, 2, 0, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

function mountPicker(partIndex = 0, target: Level = level) {
  return mount(PartPicker, {
    props: { level: target, parts: getPartRects(target), painted, partIndex },
  })
}

describe('PartPicker', () => {
  it('renders nothing for a level that is not chunked', () => {
    const wrapper = mountPicker(0, { ...level, parts: undefined })

    expect(wrapper.find('.part-picker').exists()).toBe(false)
  })

  it('lays the buttons out in the part grid and counts only interactive cells', () => {
    const wrapper = mountPicker()

    expect(wrapper.find('.part-grid').attributes('style')).toContain('repeat(2, minmax(0, 1fr))')
    expect(wrapper.findAll('.part-count').map((node) => node.text())).toEqual([
      '4/4', '1/2', '0/2', '0/4',
    ])
    expect(wrapper.findAll('.part-number').map((node) => node.text())).toEqual(['1', '2', '3', '4'])
  })

  it('follows a 3×3 split', () => {
    const wrapper = mountPicker(0, { ...level, width: 3, height: 3,
      cells: [1, 2, 3, 1, 2, 3, 1, 2, 3], parts: { cols: 3, rows: 3 } })

    expect(wrapper.find('.part-grid').attributes('style')).toContain('repeat(3, minmax(0, 1fr))')
    expect(wrapper.findAll('.part-cell')).toHaveLength(9)
  })

  it('marks the viewed part and the finished ones', () => {
    const wrapper = mountPicker(1)
    const cells = wrapper.findAll('.part-cell')

    expect(cells[0].classes()).toContain('done')
    expect(cells[0].classes()).not.toContain('current')
    expect(cells[1].classes()).toContain('current')
    expect(cells[1].classes()).not.toContain('done')
    expect(cells[1].attributes('aria-current')).toBe('true')
    expect(cells[0].attributes('aria-current')).toBeUndefined()
    expect(cells.map((cell) => cell.attributes('aria-label'))).toEqual([
      '第 1 块，已填 4 / 4',
      '第 2 块，已填 1 / 2',
      '第 3 块，已填 0 / 2',
      '第 4 块，已填 0 / 4',
    ])
  })

  it('emits the clicked part index', async () => {
    const wrapper = mountPicker()

    await wrapper.findAll('.part-cell')[2].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[2]])
  })

  it('steps between neighbouring parts and disables the two ends', async () => {
    const wrapper = mountPicker(0)
    const stepper = wrapper.findAll('.part-stepper button')

    expect(stepper[0].attributes('disabled')).toBeDefined()
    expect(stepper[1].attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.part-position').text()).toContain('第 1/4 块')
    expect(wrapper.find('.part-position').text()).toContain('已填 4/4')

    await stepper[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[1]])

    const last = mountPicker(3)
    const ends = last.findAll('.part-stepper button')
    expect(ends[0].attributes('disabled')).toBeUndefined()
    expect(ends[1].attributes('disabled')).toBeDefined()
    await ends[0].trigger('click')
    expect(last.emitted('select')).toEqual([[2]])
  })
})
