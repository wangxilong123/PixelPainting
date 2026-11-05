import { beforeEach, describe, expect, it, vi } from 'vitest'

const key = 'pixel-painting:v1:settings'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

async function loadSettings() {
  const { useGameSettings } = await import('./useGameSettings')
  return useGameSettings()
}

function readStored(): unknown {
  return JSON.parse(localStorage.getItem(key) ?? 'null')
}

describe('useGameSettings', () => {
  it('defaults to sound on, remaining counts on and immersive off', async () => {
    const settings = await loadSettings()

    expect(settings.soundEnabled.value).toBe(true)
    expect(settings.showRemaining.value).toBe(true)
    expect(settings.immersive.value).toBe(false)
  })

  it('persists the toggles and shares them between callers', async () => {
    const first = await loadSettings()
    first.toggleSound()
    first.toggleRemaining()

    expect(first.soundEnabled.value).toBe(false)
    expect(first.showRemaining.value).toBe(false)
    expect(readStored()).toEqual({ soundEnabled: false, showRemaining: false })

    const { useGameSettings } = await import('./useGameSettings')
    const second = useGameSettings()
    expect(second.soundEnabled.value).toBe(false)
    expect(second.showRemaining.value).toBe(false)
  })

  it('restores saved switches but never a stale immersive state', async () => {
    localStorage.setItem(key, JSON.stringify({ soundEnabled: false, showRemaining: false, immersive: true }))

    const settings = await loadSettings()

    expect(settings.soundEnabled.value).toBe(false)
    expect(settings.showRemaining.value).toBe(false)
    expect(settings.immersive.value).toBe(false)
  })

  it('falls back to the defaults on a corrupted payload', async () => {
    localStorage.setItem(key, 'not json')

    const settings = await loadSettings()

    expect(settings.soundEnabled.value).toBe(true)
    expect(settings.showRemaining.value).toBe(true)
  })

  it('keeps the audio service in step with the sound switch', async () => {
    const settings = await loadSettings()
    const { isSoundEnabled } = await import('../services/audioService')

    expect(isSoundEnabled()).toBe(true)
    settings.toggleSound()
    expect(isSoundEnabled()).toBe(false)
    settings.toggleSound()
    expect(isSoundEnabled()).toBe(true)
  })

  it('applies the stored sound switch to the audio service on load', async () => {
    localStorage.setItem(key, JSON.stringify({ soundEnabled: false, showRemaining: true }))

    await loadSettings()
    const { isSoundEnabled } = await import('../services/audioService')

    expect(isSoundEnabled()).toBe(false)
  })

  it('turns immersive mode on without fullscreen and off on the fullscreen event', async () => {
    const settings = await loadSettings()

    settings.toggleImmersive()
    expect(settings.immersive.value).toBe(true)
    expect(readStored()).not.toHaveProperty('immersive')

    document.dispatchEvent(new Event('fullscreenchange'))
    expect(settings.immersive.value).toBe(false)
  })

  it('requests fullscreen from the toggle when the browser supports it', async () => {
    const requested: string[] = []
    const root = document.documentElement
    Object.defineProperty(root, 'requestFullscreen', {
      configurable: true,
      value: () => {
        requested.push('enter')
        return Promise.resolve()
      },
    })

    try {
      const settings = await loadSettings()
      settings.toggleImmersive()

      expect(requested).toEqual(['enter'])
      expect(settings.immersive.value).toBe(true)
    } finally {
      Reflect.deleteProperty(root, 'requestFullscreen')
    }
  })
})
