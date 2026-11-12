import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import MaterialsPage from '../pages/MaterialsPage.vue'
import LevelSelectPage from '../pages/LevelSelectPage.vue'
import GamePage from '../pages/GamePage.vue'
import CollectionsPage from '../pages/CollectionsPage.vue'
import CollectionDetailPage from '../pages/CollectionDetailPage.vue'
import PlaceholderPage from '../pages/PlaceholderPage.vue'

export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
) {
  return createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'materials',
        component: MaterialsPage,
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
      {
        path: '/paint/:artworkId',
        name: 'paint',
        component: GamePage,
      },
      {
        path: '/collections',
        name: 'collections',
        component: CollectionsPage,
        meta: { title: '合集', icon: 'collections' },
      },
      {
        path: '/collections/:collectionId',
        name: 'collection-detail',
        component: CollectionDetailPage,
      },
      {
        path: '/studio',
        name: 'studio',
        component: PlaceholderPage,
        meta: { title: '制作像素图', icon: 'studio' },
      },
      {
        path: '/profile',
        name: 'profile',
        component: PlaceholderPage,
        meta: { title: '个人中心', icon: 'profile' },
      },
    ],
  })
}