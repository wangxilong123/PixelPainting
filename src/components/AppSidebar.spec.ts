import { mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import AppSidebar from './AppSidebar.vue'
import { createAppRouter } from '../router'

async function mountSidebar(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
  return { wrapper, router }
}

describe('AppSidebar', () => {
  it('lists the five sections with icons and links', async () => {
    const { wrapper } = await mountSidebar('/')
    try {
      const links = wrapper.findAll('.sidebar-link')
      expect(links.map((link) => link.text())).toEqual(['素材', '合集', '制作像素图', '个人中心', '关卡模式'])
      expect(links.map((link) => link.attributes('href')))
        .toEqual(['/', '/collections', '/studio', '/profile', '/levels'])
      expect(wrapper.findAll('.sidebar-link .pixel-icon')).toHaveLength(5)
      expect(wrapper.get('.sidebar-brand').text()).toContain('像素涂色')
    } finally {
      wrapper.unmount()
    }
  })

  it('marks only the current section as active', async () => {
    const { wrapper } = await mountSidebar('/levels')
    try {
      const active = wrapper.findAll('.sidebar-link.active')
      expect(active).toHaveLength(1)
      expect(active[0].text()).toBe('关卡模式')
      expect(active[0].attributes('aria-current')).toBe('page')
      expect(wrapper.get('.sidebar-link[href="/"]').attributes('aria-current')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('treats the materials entry as exact so it does not light up everywhere', async () => {
    const { wrapper } = await mountSidebar('/collections')
    try {
      expect(wrapper.get('.sidebar-link[href="/"]').classes()).not.toContain('active')
      expect(wrapper.get('.sidebar-link[href="/collections"]').classes()).toContain('active')
    } finally {
      wrapper.unmount()
    }
  })
})