export type PaintSound = 'correct' | 'incorrect' | 'complete'

type Note = {
  type: OscillatorType
  frequency: number
  /** Seconds between the sound starting and this note. */
  delay: number
  duration: number
  gain: number
}

const recipes: Record<PaintSound, readonly Note[]> = {
  correct: [{ type: 'triangle', frequency: 660, delay: 0, duration: 0.09, gain: 0.16 }],
  incorrect: [{ type: 'square', frequency: 150, delay: 0, duration: 0.14, gain: 0.12 }],
  complete: [
    { type: 'triangle', frequency: 523.25, delay: 0, duration: 0.18, gain: 0.18 },
    { type: 'triangle', frequency: 659.25, delay: 0.14, duration: 0.18, gain: 0.18 },
    { type: 'triangle', frequency: 783.99, delay: 0.28, duration: 0.34, gain: 0.2 },
  ],
}

let enabled = true
let context: AudioContext | null = null
let unavailable = false

export function setSoundEnabled(value: boolean): void {
  enabled = value
}

export function isSoundEnabled(): boolean {
  return enabled
}

// 浏览器只允许在用户操作之后创建 AudioContext，所以推迟到第一次真正播放
function ensureContext(): AudioContext | null {
  if (unavailable) return null
  if (context !== null) return context
  const Ctor = globalThis.AudioContext as (new () => AudioContext) | undefined
  if (Ctor === undefined) {
    unavailable = true
    return null
  }
  try {
    context = new Ctor()
  } catch {
    unavailable = true
    return null
  }
  return context
}

function scheduleNote(target: AudioContext, note: Note): void {
  const oscillator = target.createOscillator()
  const envelope = target.createGain()
  const begin = target.currentTime + note.delay
  const end = begin + note.duration

  oscillator.type = note.type
  oscillator.frequency.setValueAtTime(note.frequency, begin)
  envelope.gain.setValueAtTime(0.0001, begin)
  envelope.gain.linearRampToValueAtTime(note.gain, begin + 0.01)
  envelope.gain.exponentialRampToValueAtTime(0.0001, end)
  oscillator.connect(envelope)
  envelope.connect(target.destination)
  oscillator.start(begin)
  oscillator.stop(end)
}

export function playPaintSound(kind: PaintSound): void {
  if (!enabled) return
  const target = ensureContext()
  if (target === null) return
  try {
    if (target.state === 'suspended') target.resume().catch(() => {})
    for (const note of recipes[kind]) scheduleNote(target, note)
  } catch {
    // 音频被浏览器策略拦下时不打断涂色
  }
}
