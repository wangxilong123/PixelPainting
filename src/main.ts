import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router'
import { listUserArtworks } from './services/artworkStorage'
import './styles/tokens.css'
import './styles/global.css'

// 先把用户作品灌入响应式注册表，存档解析才能保住它们的进度；
// 存储不可用时静默降级，finally 保证应用照常挂载
void listUserArtworks().finally(() => {
  createApp(App).use(createAppRouter()).mount('#app')
})
