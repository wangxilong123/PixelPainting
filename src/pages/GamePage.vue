<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PaintResult } from '../canvas/pixelCanvas'
import ColorPalette from '../components/ColorPalette.vue'
import CompletionDialog from '../components/CompletionDialog.vue'
import PixelCanvas from '../components/PixelCanvas.vue'
import { useLevelProgress } from '../composables/useLevelProgress'
import { getLevelById, getInteractiveCellCount } from '../services/levelService'

const route = useRoute()
const router = useRouter()
const {
  currentProgress,
  openLevel,
  paintCell,
  revertCell,
  repaintCell,
  recordHint,
  setElapsedSeconds,
  setViewport,
  restartLevel,
  getNextLevelId,
} = useLevelProgress()

const levelId = computed(() => String(route.params.levelId ?? ''))
const level = computed(() => getLevelById(levelId.value))
const entered = ref(false)

const selectedColorId = ref<number | null>(null)
const hintIndex = ref<number | null>(null)
const paintedCount = ref(0)
const elapsed = ref(0)
const dialogOpen = ref(false)
const confirmRestart = ref(false)
const history = ref<{ index: number; colorId: number }[]>([])
const redoStack = ref<{ index: number; colorId: number }[]>([])
const canvasRef = ref<InstanceType<typeof PixelCanvas> | null>(null)

let timer: number | undefined
let baseElapsed = 0
let sinceTs = 0
let completedGuard = false

const isCompleted = computed(() => currentProgress.value?.completedAt !== undefined)
const canUndo = computed(() => history.value.length > 0 && !isCompleted.value)
const canRedo = computed(() => redoStack.value.length > 0 && !isCompleted.value)
const total = computed(() => (level.value ? getInteractiveCellCount(level.value) : 0))
const timeDisplay = computed(() => formatTime(elapsed.value))
const resultStars = computed(() => currentProgress.value?.stars ?? 3)
const resultElapsed = computed(() => currentProgress.value?.elapsedSeconds ?? 0)
const resultHints = computed(() => currentProgress.value?.hintsUsed ?? 0)
const nextLevelId = computed(() => (dialogOpen.value ? getNextLevelId() : undefined))

const remainingCounts = computed(() => {
  const counts = new Map<number, number>()
  const current = level.value
  const progress = currentProgress.value
  if (!current || !progress) return counts
  for (const color of current.palette) counts.set(color.id, 0)
  for (const [index, target] of current.cells.entries()) {
    if (target === 0 || progress.painted[index] === target) continue
    counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  return counts
})

function firstAvailableColor(): number | null {
  for (const color of level.value?.palette ?? []) {
    if ((remainingCounts.value.get(color.id) ?? 0) > 0) return color.id
  }
  return null
}

// 当前颜色涂完后按调色板顺序切到下一个仍有剩余格子的颜色
watch(remainingCounts, () => {
  if (isCompleted.value) return
  const selected = selectedColorId.value
  if (selected !== null && (remainingCounts.value.get(selected) ?? 0) > 0) return
  const next = firstAvailableColor()
  if (next !== null) selectedColorId.value = next
})

function formatTime(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function stopTimer(): void {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

function startTimer(): void {
  stopTimer()
  baseElapsed = currentProgress.value?.elapsedSeconds ?? 0
  elapsed.value = baseElapsed
  if (currentProgress.value?.completedAt) return
  sinceTs = Date.now()
  timer = window.setInterval(() => {
    const seconds = baseElapsed + Math.floor((Date.now() - sinceTs) / 1000)
    elapsed.value = seconds
    setElapsedSeconds(seconds)
  }, 1000)
}

function countPainted(): number {
  const current = level.value
  const progress = currentProgress.value
  if (!current || !progress) return 0
  let count = 0
  for (const [index, color] of current.cells.entries()) {
    if (color !== 0 && progress.painted[index] === color) count += 1
  }
  return count
}

function enter(id: string): void {
  stopTimer()
  history.value = []
  redoStack.value = []
  hintIndex.value = null
  dialogOpen.value = false
  confirmRestart.value = false
  completedGuard = false
  if (!openLevel(id)) {
    entered.value = false
    router.replace({ name: 'levels' })
    return
  }
  entered.value = true
  selectedColorId.value = firstAvailableColor()
  paintedCount.value = countPainted()
  startTimer()
}

watch(levelId, (id) => enter(id), { immediate: true })
onBeforeUnmount(stopTimer)

function readPainted(): readonly number[] {
  return currentProgress.value?.painted ?? []
}

// 任务 6 在此接入正确与错误音效
function onPaint(result: PaintResult): void {
  if (result.status !== 'painted') return
  history.value.push({ index: result.index, colorId: result.colorId })
  redoStack.value = []
}

function onProgress(progress: { paintedCount: number; total: number }): void {
  paintedCount.value = progress.paintedCount
}

// 任务 6 在此接入完成音效
function onCompleted(): void {
  if (completedGuard) return
  completedGuard = true
  stopTimer()
  dialogOpen.value = true
}

function useHint(): void {
  const index = recordHint()
  if (index !== undefined) hintIndex.value = index
}

function undo(): void {
  const last = history.value[history.value.length - 1]
  if (!last || !revertCell(last.index)) return
  history.value.pop()
  redoStack.value.push(last)
  paintedCount.value = countPainted()
}

function redo(): void {
  const last = redoStack.value[redoStack.value.length - 1]
  if (!last || !repaintCell(last.index, last.colorId)) return
  redoStack.value.pop()
  history.value.push(last)
  paintedCount.value = countPainted()
  if (currentProgress.value?.completedAt) onCompleted()
}

function requestRestart(): void {
  confirmRestart.value = true
}

function doRestart(): void {
  confirmRestart.value = false
  dialogOpen.value = false
  completedGuard = false
  restartLevel()
  history.value = []
  redoStack.value = []
  hintIndex.value = null
  paintedCount.value = 0
  selectedColorId.value = firstAvailableColor()
  canvasRef.value?.resetViewport()
  startTimer()
}

function goNext(): void {
  const next = getNextLevelId()
  if (!next) return
  dialogOpen.value = false
  router.replace({ name: 'game', params: { levelId: next } })
}

function backToList(): void {
  dialogOpen.value = false
  router.push({ name: 'levels' })
}
</script>

<template>
  <div v-if="entered && level && currentProgress" class="game-page">
    <header class="game-bar">
      <button type="button" @click="router.push({ name: 'levels' })">返回</button>
      <h2 class="game-title">{{ level.title }}</h2>
      <span class="game-stat">已填 {{ paintedCount }} / {{ total }}</span>
      <span class="game-stat game-timer" role="timer">{{ timeDisplay }}</span>
    </header>

    <PixelCanvas
      ref="canvasRef"
      :level="level"
      :read-painted="readPainted"
      :commit-paint="paintCell"
      :selected-color-id="selectedColorId"
      :viewport="currentProgress.viewport"
      :hint-index="hintIndex"
      :auto-fit="true"
      @paint="onPaint"
      @progress="onProgress"
      @completed="onCompleted"
      @viewport-change="setViewport"
    />

    <div class="game-controls">
      <button type="button" :disabled="isCompleted" @click="useHint">提示</button>
      <button type="button" :disabled="!canUndo" @click="undo">撤销</button>
      <button type="button" :disabled="!canRedo" @click="redo">重做</button>
      <button type="button" @click="canvasRef?.resetViewport()">复位视图</button>
      <template v-if="confirmRestart">
        <button type="button" class="danger" @click="doRestart">确认重新开始</button>
        <button type="button" @click="confirmRestart = false">取消</button>
      </template>
      <button v-else type="button" @click="requestRestart">重新开始</button>
    </div>

    <ColorPalette
      :palette="level.palette"
      :cells="level.cells"
      :painted="currentProgress.painted"
      :selected-color-id="selectedColorId"
      @select="selectedColorId = $event"
    />

    <CompletionDialog
      :open="dialogOpen"
      :stars="resultStars"
      :elapsed-seconds="resultElapsed"
      :hints-used="resultHints"
      :next-level-id="nextLevelId"
      :level="level"
      @next="goNext"
      @replay="doRestart"
      @back="backToList"
    />
  </div>
</template>

<style scoped>
.game-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.game-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.game-title {
  font-size: 1.1rem;
  margin: 0;
}

.game-stat {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.game-timer {
  margin-left: auto;
}

.game-bar button,
.game-controls button {
  padding: 0.4rem 0.9rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.game-bar button:disabled,
.game-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.game-controls button.danger {
  border-color: #f87171;
  color: #f87171;
}

.game-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}
</style>
