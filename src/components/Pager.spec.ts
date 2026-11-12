import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Pager from './Pager.vue'

describe('Pager', () => {
  it('stays hidden when everything fits on one page', () => {
    const wrapper = mount(Pager, { props: { page: 1, totalPages: 1 } })
    expect(wrapper.find('.pager').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the position and emits page changes within bounds', async () => {
    const wrapper = mount(Pager, { props: { page: 2, totalPages: 5 } })
    try {
      expect(wrapper.get('.pager-status').text()).toBe('第 2 / 5 页')
      const [prev, next] = wrapper.findAll('button')
      expect(prev.attributes('disabled')).toBeUndefined()
      expect(next.attributes('disabled')).toBeUndefined()
      await prev.trigger('click')
      await next.trigger('click')
      expect(wrapper.emitted('change')).toEqual([[1], [3]])
    } finally {
      wrapper.unmount()
    }
  })

  it('disables the buttons at the first and last page', () => {
    const first = mount(Pager, { props: { page: 1, totalPages: 3 } })
    expect(first.findAll('button')[0].attributes('disabled')).toBeDefined()
    expect(first.findAll('button')[1].attributes('disabled')).toBeUndefined()
    first.unmount()

    const last = mount(Pager, { props: { page: 3, totalPages: 3 } })
    expect(last.findAll('button')[0].attributes('disabled')).toBeUndefined()
    expect(last.findAll('button')[1].attributes('disabled')).toBeDefined()
    last.unmount()
  })
})