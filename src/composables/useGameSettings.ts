import { computed, ref, type Ref } from 'vue'
import { setSoundEnabled } from '../services/audioService'
import { useLocalStorage } from './useLocalStorage'

export type GameSettings = {
  soundEnabled: boolean
  showRemaining: boolean
  immersive: boolean
}

const storageKey = 'pixel-painting:v1:settings'
const defaults: GameSettings = { soundEnabled: true, showRemaining: true, immersive: false }
const storage = useLocalStorage(storageKey)

let sharedState: Ref<GameSettings> | undefined

function loadSettings(): GameSettings {
  try {
    const raw = storage.read()
    if (raw === null) return { ...defaults }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...defaults }
    const record = parsed as Record<string, unknown>
    return {
      soundEnabled: typeof record.soundEnabled === 'boolean' ? record.soundEnabled : defaults.soundEnabled,
      showRemaining: typeof record.showRemaining === 'boolean' ? record.showRemaining : defaults.showRemaining,
      // 刷新后浏览器一定不在全屏，读回来只会让界面停在假沉浸状态
      immersive: false,
    }
  } catch {
    return { ...defaults }
  }
}

function apply(state: Ref<GameSettings>, patch: Partial<GameSettings>): void {
  state.value = { ...state.value, ...patch }
  setSoundEnabled(state.value.soundEnabled)
  storage.write(
    JSON.stringify({ soundEnabled: state.value.soundEnabled, showRemaining: state.value.showRemaining }),
  )
}

function syncFullscreen(active: boolean): void {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
  if (active) {
    if (typeof root.requestFullscreen === 'function') root.requestFullscreen().catch(() => {})
    else if (typeof root.webkitRequestFullscreen === 'function') root.webkitRequestFullscreen()
    return
  }
  if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
    document.exitFullscreen().catch(() => {})
  }
}

function createState(): Ref<GameSettings> {
  const state = ref(loadSettings())
  setSoundEnabled(state.value.soundEnabled)
  // Esc 退出全屏由浏览器接管，只能靠 fullscreenchange 把界面状态改回来
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.value.immersive) apply(state, { immersive: false })
  })
  return state
}

export function useGameSettings() {
  const state = sharedState ??= createState()

  return {
    soundEnabled: computed(() => state.value.soundEnabled),
    showRemaining: computed(() => state.value.showRemaining),
    immersive: computed(() => state.value.immersive),
    toggleSound(): void {
      apply(state, { soundEnabled: !state.value.soundEnabled })
    },
    toggleRemaining(): void {
      apply(state, { showRemaining: !state.value.showRemaining })
    },
    toggleImmersive(): void {
      const next = !state.value.immersive
      apply(state, { immersive: next })
      syncFullscreen(next)
    },
  }
}
