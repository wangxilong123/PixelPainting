import { h } from 'vue'
import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'

export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
) {
  return createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'home',
        component: { render: () => h('h2', '欢迎来到像素涂色') },
      },
      {
        path: '/levels',
        name: 'levels',
        component: { render: () => h('h2', '关卡列表即将到来') },
      },
      {
        path: '/game/:levelId',
        name: 'game',
        component: { render: () => h('h2', '游戏页面即将到来') },
      },
    ],
  })
}
