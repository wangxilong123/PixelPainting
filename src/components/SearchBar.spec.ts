import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SearchBar from './SearchBar.vue'

describe('SearchBar', () => {
  it('edits the bound query and offers a clear button only while non-empty', async () => {
    const wrapper = mount(SearchBar, { props: { modelValue: '' } })
    try {
      expect(wrapper.find('.search-clear').exists()).toBe(false)
      await wrapper.get('input').setValue('企鹅')
      expect(wrapper.emitted('update:modelValue')).toEqual([['企鹅']])

      await wrapper.setProps({ modelValue: '企鹅' })
      const clear = wrapper.get('.search-clear')
      expect(clear.attributes('aria-label')).toBe('清空搜索')
      await clear.trigger('click')
      const emitted = wrapper.emitted('update:modelValue') ?? []
      expect(emitted[emitted.length - 1]).toEqual([''])
    } finally {
      wrapper.unmount()
    }
  })
})