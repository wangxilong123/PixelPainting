import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import HomePage from '../pages/HomePage.vue'
import LevelSelectPage from '../pages/LevelSelectPage.vue'
import GamePage from '../pages/GamePage.vue'

export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
) {
  return createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'home',
        component: HomePage,
      },
      {
        path: '/levels',
        name: 'levels',
        component: LevelSelectPage,
      },
      {
        path: '/game/:levelId',
        name: 'game',
        component: GamePage,
      },
    ],
  })
}
