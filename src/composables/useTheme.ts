import { computed, ref, type Ref } from 'vue'
import { useLocalStorage } from './useLocalStorage'

export type Theme = 'dark' | 'light'

// 存纯文本 'dark' / 'light'，index.html 的首屏内联脚本读同一个键，两边规则要一致
const storageKey = 'pixel-painting:v1:theme'
const storage = useLocalStorage(storageKey)

let sharedState: Ref<Theme> | undefined

function systemTheme(): Theme {
  if (typeof globalThis.matchMedia !== 'function') return 'dark'
  return globalThis.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function loadTheme(): Theme {
  const raw = storage.read()
  // 没存过就跟随系统，存坏了也退回系统，不硬塞一个主题给所有者
  return raw === 'light' || raw === 'dark' ? raw : systemTheme()
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

export function useTheme() {
  const state = sharedState ??= ref(loadTheme())
  applyTheme(state.value)

  function setTheme(next: Theme): void {
    state.value = next
    applyTheme(next)
    storage.write(next)
  }

  return {
    theme: computed(() => state.value),
    isLight: computed(() => state.value === 'light'),
    setTheme,
    toggleTheme(): void {
      setTheme(state.value === 'light' ? 'dark' : 'light')
    },
  }
}