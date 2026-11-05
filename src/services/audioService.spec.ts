import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type OscillatorStub = {
  type: string
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

type GainStub = {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>
    linearRampToValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  connect: ReturnType<typeof vi.fn>
}

function installAudioContext(options: { throws?: boolean; state?: string } = {}) {
  const instances: { state: string; resume: ReturnType<typeof vi.fn> }[] = []
  const oscillators: OscillatorStub[] = []
  const gains: GainStub[] = []

  class StubAudioContext {
    state = options.state ?? 'running'
    currentTime = 1.5
    destination = { kind: 'destination' }
    resume = vi.fn(() => Promise.resolve())

    constructor() {
      if (options.throws) throw new Error('浏览器拒绝了音频上下文')
      instances.push(this)
    }

    createOscillator(): OscillatorStub {
      const node: OscillatorStub = {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      oscillators.push(node)
      return node
    }

    createGain(): GainStub {
      const node: GainStub = {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }
      gains.push(node)
      return node
    }
  }

  vi.stubGlobal('AudioContext', StubAudioContext)
  return { instances, oscillators, gains }
}

async function loadService() {
  return import('./audioService')
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('audioService', () => {
  it('reports the sound switch', async () => {
    const audio = await loadService()

    expect(audio.isSoundEnabled()).toBe(true)
    audio.setSoundEnabled(false)
    expect(audio.isSoundEnabled()).toBe(false)
  })

  it('stays silent and never creates a context while sound is off', async () => {
    const stub = installAudioContext()
    const audio = await loadService()

    audio.setSoundEnabled(false)
    audio.playPaintSound('correct')
    audio.playPaintSound('complete')

    expect(stub.instances).toHaveLength(0)
    expect(stub.oscillators).toHaveLength(0)
  })

  it('creates the context on the first sound and reuses it afterwards', async () => {
    const stub = installAudioContext()
    const audio = await loadService()

    audio.playPaintSound('correct')
    audio.playPaintSound('incorrect')

    expect(stub.instances).toHaveLength(1)
    expect(stub.oscillators).toHaveLength(2)
    expect(stub.gains).toHaveLength(2)
    stub.oscillators.forEach((oscillator, index) => {
      expect(oscillator.connect).toHaveBeenCalledWith(stub.gains[index])
      expect(oscillator.start).toHaveBeenCalledOnce()
      expect(oscillator.stop).toHaveBeenCalledOnce()
    })
    for (const gain of stub.gains) expect(gain.connect).toHaveBeenCalledOnce()
  })

  it('plays a longer phrase when the level is completed', async () => {
    const stub = installAudioContext()
    const audio = await loadService()

    audio.playPaintSound('complete')
    expect(stub.oscillators).toHaveLength(3)
    expect(stub.oscillators.map((node) => node.type)).toEqual(['triangle', 'triangle', 'triangle'])
  })

  it('resumes a suspended context before scheduling', async () => {
    const stub = installAudioContext({ state: 'suspended' })
    const audio = await loadService()

    audio.playPaintSound('correct')

    expect(stub.instances[0]?.resume).toHaveBeenCalledOnce()
    expect(stub.oscillators).toHaveLength(1)
  })

  it('swallows a context the browser refuses to create', async () => {
    installAudioContext({ throws: true })
    const audio = await loadService()

    expect(() => audio.playPaintSound('incorrect')).not.toThrow()
  })

  it('stays quiet when the browser has no Web Audio support', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const audio = await loadService()

    expect(() => audio.playPaintSound('complete')).not.toThrow()
  })
})
