<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PaintResult, PartOverview } from '../canvas/pixelCanvas'
import ColorPalette from '../components/ColorPalette.vue'
import CompletionDialog from '../components/CompletionDialog.vue'
import GameSettings from '../components/GameSettings.vue'
import PixelCanvas from '../components/PixelCanvas.vue'
import PixelIcon from '../components/PixelIcon.vue'
import { useGameSettings } from '../composables/useGameSettings'
import { useLevelProgress } from '../composables/useLevelProgress'
import { playPaintSound } from '../services/audioService'
import { getArtworkById } from '../services/artworkService'
import { getLevelById, getInteractiveCellCount, getPartRects } from '../services/levelService'

const route = useRoute()
const router = useRouter()
const {
  currentProgress,
  openLevel,
  openArtwork,
  paintCell,
  revertCell,
  repaintCell,
  recordHint,
  setElapsedSeconds,
  setViewport,
  setPartIndex,
  restartLevel,
  getNextLevelId,
} = useLevelProgress()

// 自由涂色和关卡模式共用这一页：素材没有解锁顺序，计时可以关
const isPaint = computed(() => route.name === 'paint')
const workId = computed(() =>
  String((isPaint.value ? route.params.artworkId : route.params.levelId) ?? ''),
)
const work = computed(() => (isPaint.value ? getArtworkById(workId.value) : getLevelById(workId.value)))
const entered = ref(false)
const settingsOpen = ref(false)
const timingEnabled = ref(true)

const { showRemaining, immersive, toggleImmersive } = useGameSettings()

// 进入沉浸模式时收起抽屉，退出时它不会突然盖回画布上
watch(immersive, (value) => {
  if (value) settingsOpen.value = false
})

const selectedColorId = ref<number | null>(null)
const hintIndex = ref<number | null>(null)
const paintedCount = ref(0)
const elapsed = ref(0)
const dialogOpen = ref(false)
const confirmRestart = ref(false)
const history = ref<{ index: number; colorId: number }[]>([])
const redoStack = ref<{ index: number; colorId: number }[]>([])
const canvasRef = ref<InstanceType<typeof PixelCanvas> | null>(null)

// 分块关卡的引导循环：整图预览 → 涂一块 → 完成自动回预览 → 下一块
const phase = ref<'overview' | 'painting'>('painting')
const activePartIndex = ref(0)
const partJustCompleted = ref(false)

let timer: number | undefined
let baseElapsed = 0
let sinceTs = 0
let completedGuard = false

const isCompleted = computed(() => currentProgress.value?.completedAt !== undefined)
const canUndo = computed(() => history.value.length > 0 && !isCompleted.value)
const canRedo = computed(() => redoStack.value.length > 0 && !isCompleted.value)
const total = computed(() => (work.value ? getInteractiveCellCount(work.value) : 0))
const partRects = computed(() => (work.value ? getPartRects(work.value) : []))
const isChunked = computed(() => partRects.value.length > 1)
// 不分块的关卡传 null，画布走整图那条路；分块关卡只在涂色阶段画当前块
const currentPart = computed(() =>
  isChunked.value && phase.value === 'painting'
    ? partRects.value[activePartIndex.value] ?? null
    : null,
)

const partStats = computed(() => {
  const current = work.value
  const painted = currentProgress.value?.painted
  if (!current || !painted) return []
  return partRects.value.map((rect) => {
    let total = 0
    let done = 0
    for (let row = rect.y; row < rect.y + rect.height; row += 1) {
      for (let column = rect.x; column < rect.x + rect.width; column += 1) {
        const index = row * current.width + column
        const target = current.cells[index]
        if (target === 0) continue
        total += 1
        if (painted[index] === target) done += 1
      }
    }
    return { total, done }
  })
})
const completedParts = computed(() => partStats.value.filter((s) => s.done === s.total).length)
const firstUnfinishedPart = computed(() => partStats.value.findIndex((s) => s.done < s.total))

const overviewState = computed<PartOverview | null>(() => {
  if (!isChunked.value || phase.value !== 'overview') return null
  const next = firstUnfinishedPart.value
  return {
    parts: partRects.value,
    done: partStats.value.map((s) => s.done === s.total),
    next: next >= 0 ? next : null,
  }
})
const overviewStatus = computed(() => {
  const count = partRects.value.length
  if (isCompleted.value) return `全部 ${count} 块已完成`
  const base = `已完成 ${completedParts.value} / ${count} 块`
  const next = firstUnfinishedPart.value
  return next >= 0 ? `${base} · 下一块：第 ${next + 1} 块` : base
})
const overviewAction = computed(() => {
  if (isCompleted.value) return '再玩一次'
  if (partJustCompleted.value) return '下一块'
  return paintedCount.value === 0 ? '开始涂色' : '继续涂色'
})
const overviewIcon = computed(() => {
  if (isCompleted.value) return 'replay'
  return partJustCompleted.value ? 'arrow-right' : 'studio'
})
const progressPercent = computed(() =>
  total.value === 0 ? '0%' : `${Math.round((paintedCount.value / total.value) * 100)}%`,
)
const timeDisplay = computed(() => formatTime(elapsed.value))
const resultElapsed = computed(() => currentProgress.value?.elapsedSeconds ?? 0)
const resultHints = computed(() => currentProgress.value?.hintsUsed ?? 0)
const nextLevelId = computed(() => (dialogOpen.value && !isPaint.value ? getNextLevelId() : undefined))

const remainingCounts = computed(() => {
  const counts = new Map<number, number>()
  const current = work.value
  const progress = currentProgress.value
  if (!current || !progress) return counts
  for (const color of current.palette) counts.set(color.id, 0)
  // 分块涂色时只数当前块：调色板剩余、禁用和自动换色都跟着块走，
  // 别的块还剩多少色与这一笔无关
  const scope = currentPart.value
  for (const [index, target] of current.cells.entries()) {
    if (target === 0 || progress.painted[index] === target) continue
    if (scope) {
      const row = Math.floor(index / current.width)
      const column = index % current.width
      if (row < scope.y || row >= scope.y + scope.height
        || column < scope.x || column >= scope.x + scope.width) continue
    }
    counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  return counts
})

// 分块涂色时调色板也只数当前块：块外的目标色掩成 0，
// 这块没有的颜色直接不显示，玩家不会选到一个涂哪都错的颜色
const paletteCells = computed(() => {
  const current = work.value
  if (!current) return []
  const scope = currentPart.value
  if (!scope) return current.cells
  return current.cells.map((target, index) => {
    const row = Math.floor(index / current.width)
    const column = index % current.width
    const inside = row >= scope.y && row < scope.y + scope.height
      && column >= scope.x && column < scope.x + scope.width
    return inside ? target : 0
  })
})

// 分块时数量为 0 的颜色从调色板里撤掉而不是摆一排禁用格；
// 颜色编号保持整图原编号，格子上的数字不受影响
const paletteColors = computed(() => {
  const palette = work.value?.palette ?? []
  if (!isChunked.value) return palette
  return palette.filter((color) => (remainingCounts.value.get(color.id) ?? 0) > 0)
})

function firstAvailableColor(): number | null {
  for (const color of work.value?.palette ?? []) {
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
  if (isPaint.value && !timingEnabled.value) return
  sinceTs = Date.now()
  timer = window.setInterval(() => {
    const seconds = baseElapsed + Math.floor((Date.now() - sinceTs) / 1000)
    elapsed.value = seconds
    setElapsedSeconds(seconds)
  }, 1000)
}

function toggleTiming(): void {
  timingEnabled.value = !timingEnabled.value
  if (timingEnabled.value) startTimer()
  else stopTimer()
}

function countPainted(): number {
  const current = work.value
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
  timingEnabled.value = true
  const opened = isPaint.value ? openArtwork(id) : openLevel(id)
  if (!opened) {
    entered.value = false
    router.replace({ name: isPaint.value ? 'materials' : 'levels' })
    return
  }
  entered.value = true
  // 分块关卡先给整图预览，玩家点开始/继续才落到第一个未完成的块
  phase.value = isChunked.value ? 'overview' : 'painting'
  activePartIndex.value = 0
  partJustCompleted.value = false
  selectedColorId.value = firstAvailableColor()
  paintedCount.value = countPainted()
  startTimer()
}

// 离开涂色路由时 workId 会清空，不能再触发进入逻辑，否则失败重定向会连环跳
watch(workId, (id) => {
  if (route.name === 'game' || route.name === 'paint') enter(id)
}, { immediate: true })
onBeforeUnmount(stopTimer)

function readPainted(): readonly number[] {
  return currentProgress.value?.painted ?? []
}

function onPaint(result: PaintResult): void {
  if (result.status === 'incorrect') {
    playPaintSound('incorrect')
    return
  }
  if (result.status !== 'painted') return
  playPaintSound('correct')
  history.value.push({ index: result.index, colorId: result.colorId })
  redoStack.value = []
}

function onProgress(progress: { paintedCount: number; total: number }): void {
  paintedCount.value = progress.paintedCount
  checkPartCompletion()
}

// 当前块涂满就自动回到整图预览，让玩家看到这块在整幅画里的效果
function checkPartCompletion(): void {
  if (!isChunked.value || phase.value !== 'painting') return
  const stats = partStats.value[activePartIndex.value]
  if (!stats || stats.done < stats.total) return
  partJustCompleted.value = true
  hintIndex.value = null
  phase.value = 'overview'
  // 最后一块完成时完成音效交给 onCompleted，这里不重复播
  if (!isCompleted.value) playPaintSound('complete')
}

function onCompleted(): void {
  if (completedGuard) return
  completedGuard = true
  stopTimer()
  playPaintSound('complete')
  dialogOpen.value = true
}

function startPart(index: number): void {
  hintIndex.value = null
  history.value = []
  redoStack.value = []
  partJustCompleted.value = false
  activePartIndex.value = index
  setPartIndex(index)
  phase.value = 'painting'
}

function onOverviewAction(): void {
  if (isCompleted.value) {
    requestRestart()
    return
  }
  const index = firstUnfinishedPart.value
  if (index >= 0) startPart(index)
}

function useHint(): void {
  const index = recordHint(selectedColorId.value)
  if (index === undefined) return
  hintIndex.value = index
  // 重复点提示时同一格也要重新居中
  canvasRef.value?.centerOnCell(index)
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
  else checkPartCompletion()
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
  phase.value = isChunked.value ? 'overview' : 'painting'
  activePartIndex.value = 0
  partJustCompleted.value = false
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
  router.push({ name: isPaint.value ? 'materials' : 'levels' })
}
</script>

<template>
  <div v-if="entered && work && currentProgress" class="game-page">
    <header v-if="!immersive" class="game-bar">
      <button type="button" @click="backToList">
        <PixelIcon name="arrow-left" />
        <span>返回</span>
      </button>
      <h2 class="game-title">{{ work.title }}</h2>
      <span class="game-stat">已填 {{ paintedCount }} / {{ total }}</span>
      <span class="game-clock">
        <span v-if="!isPaint || timingEnabled" class="game-stat game-timer" role="timer">{{ timeDisplay }}</span>
        <button
          v-if="isPaint"
          type="button"
          class="timer-toggle"
          :aria-pressed="timingEnabled"
          @click="toggleTiming"
        >
          <PixelIcon :name="timingEnabled ? 'clock' : 'clock-off'" />
          <span>{{ timingEnabled ? '计时开' : '计时关' }}</span>
        </button>
      </span>
      <div class="game-settings">
        <button
          type="button"
          :aria-expanded="settingsOpen"
          @click="settingsOpen = !settingsOpen"
        >
          <PixelIcon name="settings" />
          <span>设置</span>
        </button>
        <GameSettings :open="settingsOpen" @close="settingsOpen = false" />
      </div>
      <div
        class="game-progress"
        role="progressbar"
        aria-label="涂色进度"
        :aria-valuenow="paintedCount"
        :aria-valuemin="0"
        :aria-valuemax="total"
      >
        <span class="game-progress-fill" :style="{ width: progressPercent }" />
      </div>
    </header>

    <button v-else type="button" class="immersive-exit" @click="toggleImmersive">
      <PixelIcon name="compress" />
      <span>退出沉浸</span>
    </button>

    <PixelCanvas
      ref="canvasRef"
      :level="work"
      :read-painted="readPainted"
      :commit-paint="paintCell"
      :selected-color-id="selectedColorId"
      :viewport="currentProgress.viewport"
      :hint-index="hintIndex"
      :part="currentPart"
      :overview="overviewState"
      :auto-fit="true"
      :animate="true"
      @paint="onPaint"
      @progress="onProgress"
      @completed="onCompleted"
      @viewport-change="setViewport"
    />

    <div v-if="isChunked && phase === 'overview'" class="part-overview">
      <p class="part-overview-status" aria-live="polite">{{ overviewStatus }}</p>
      <div class="part-overview-actions">
        <template v-if="confirmRestart">
          <button type="button" class="danger" @click="doRestart">
            <PixelIcon name="warn" />
            <span>确认重新开始</span>
          </button>
          <button type="button" @click="confirmRestart = false">
            <PixelIcon name="close" />
            <span>取消</span>
          </button>
        </template>
        <button v-else type="button" class="part-start" @click="onOverviewAction">
          <PixelIcon :name="overviewIcon" />
          <span>{{ overviewAction }}</span>
        </button>
      </div>
      <p v-if="!isCompleted" class="part-overview-tip">涂完一块会回到这里预览整体效果，再进入下一块</p>
    </div>

    <div v-if="phase === 'painting'" class="game-controls">
      <button type="button" :disabled="isCompleted" @click="useHint">
        <PixelIcon name="hint" />
        <span>提示</span>
      </button>
      <button type="button" :disabled="!canUndo" @click="undo">
        <PixelIcon name="undo" />
        <span>撤销</span>
      </button>
      <button type="button" :disabled="!canRedo" @click="redo">
        <PixelIcon name="redo" />
        <span>重做</span>
      </button>
      <button type="button" @click="canvasRef?.resetViewport()">
        <PixelIcon name="reset-view" />
        <span>复位视图</span>
      </button>
      <template v-if="confirmRestart">
        <button type="button" class="danger" @click="doRestart">
          <PixelIcon name="warn" />
          <span>确认重新开始</span>
        </button>
        <button type="button" @click="confirmRestart = false">
          <PixelIcon name="close" />
          <span>取消</span>
        </button>
      </template>
      <button v-else type="button" @click="requestRestart">
        <PixelIcon name="replay" />
        <span>重新开始</span>
      </button>
    </div>

    <ColorPalette
      v-if="phase === 'painting'"
      :palette="paletteColors"
      :cells="paletteCells"
      :painted="currentProgress.painted"
      :selected-color-id="selectedColorId"
      :show-remaining="showRemaining"
      @select="selectedColorId = $event"
    />

    <CompletionDialog
      :open="dialogOpen"
      :elapsed-seconds="resultElapsed"
      :hints-used="resultHints"
      :next-level-id="nextLevelId"
      :level="work"
      :title="isPaint ? '作品完成！' : undefined"
      :back-label="isPaint ? '返回素材库' : undefined"
      @next="goNext"
      @replay="doRestart"
      @back="backToList"
    />
  </div>
</template>

<style scoped>
.game-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-4);
}

.game-bar {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

/* 沉浸模式下顶栏和导航都收起来，只留一个角落里的退出按钮 */
.immersive-exit {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.8rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  opacity: 0.7;
}

.immersive-exit .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  /* 角落里的退出按钮保持安静，不抢语义色 */
  color: inherit;
}

.immersive-exit:hover {
  color: var(--color-text);
  opacity: 1;
}

.game-title {
  font-size: 1.1rem;
  margin: 0;
}

.game-stat {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.game-clock {
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  margin-left: auto;
}

.game-bar button,
.game-controls button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--action-font);
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.game-bar button .pixel-icon,
.game-controls button .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.game-bar button:hover:not(:disabled),
.game-controls button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}

.game-bar button:disabled,
.game-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.game-controls button.danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

/* 危险按钮整体已经是红色，图标跟按钮走，不叠语义色 */
.game-controls button.danger .pixel-icon {
  color: inherit;
}

/* 进度条占满一整行，压在顶栏底部，不额外吃画布空间 */
.game-progress {
  flex-basis: 100%;
  height: 0.375rem;
  border: 1px solid var(--color-border);
  background: var(--color-background);
}

.game-progress-fill {
  display: block;
  height: 100%;
  background: var(--color-primary);
  transition: width var(--transition-fast);
}

.game-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

/* 整图预览的操作条：状态一行、主按钮居中放大，引导玩家进入下一块 */
.part-overview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  animation: part-overview-rise 300ms ease-out;
}

@keyframes part-overview-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.part-overview-status {
  margin: 0;
  color: var(--color-text);
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
}

.part-overview-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-4);
}

.part-overview-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--action-font);
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast),
    transform var(--transition-fast), box-shadow var(--transition-fast);
}

.part-overview-actions button .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.part-overview-actions button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}

.part-overview-actions button.danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.part-overview-actions button.danger .pixel-icon {
  color: inherit;
}

.part-overview-actions .part-start {
  padding: 0.7rem 2.4rem;
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #11111b;
  font-size: 1.2rem;
  font-weight: 700;
  box-shadow: 0 0 18px rgba(255, 204, 102, 0.25);
}

.part-overview-actions .part-start .pixel-icon {
  color: inherit;
}

.part-overview-actions .part-start:hover:not(:disabled) {
  border-color: var(--color-primary);
  background: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 24px rgba(255, 204, 102, 0.4);
}

.part-overview-tip {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>
