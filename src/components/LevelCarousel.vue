<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Level, LevelProgress } from '../models/level'
import { getLevels } from '../services/levelService'
import { isLevelCleared, isLevelUnlocked } from '../services/progressService'
import LevelCard from './LevelCard.vue'

const props = defineProps<{
  levels: Level[]
  records: Record<string, LevelProgress>
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [levelId: string]
  open: [levelId: string]
}>()

const track = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

// 解锁按全局顺序判断，分类筛选只决定轮播里显示哪些关卡
const allLevels = getLevels()

const entries = computed(() =>
  props.levels.map((level) => {
    const attempt = props.records[level.id]
    return {
      level,
      unlocked: isLevelUnlocked(allLevels, props.records, level.id),
      cleared: isLevelCleared(level, attempt),
    }
  }),
)

const activeId = computed(() => props.levels[activeIndex.value]?.id)

function indexOf(id: string | undefined): number {
  return id === undefined ? -1 : props.levels.findIndex((level) => level.id === id)
}

function scrollBehavior(): ScrollBehavior {
  if (typeof window.matchMedia !== 'function') return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function scrollToIndex(index: number, behavior: ScrollBehavior): void {
  const element = track.value
  const slot = element?.children[index] as HTMLElement | undefined
  if (!element || !slot) return
  const left = Math.max(0, slot.offsetLeft - (element.clientWidth - slot.offsetWidth) / 2)
  if (typeof element.scrollTo === 'function') element.scrollTo({ left, behavior })
  else element.scrollLeft = left
}

function nearestIndex(): number {
  const element = track.value
  if (!element || element.children.length === 0) return activeIndex.value
  const center = element.scrollLeft + element.clientWidth / 2
  let best = 0
  let distance = Number.POSITIVE_INFINITY
  for (const [index, child] of [...element.children].entries()) {
    const slot = child as HTMLElement
    const offset = Math.abs(slot.offsetLeft + slot.offsetWidth / 2 - center)
    if (offset < distance) {
      distance = offset
      best = index
    }
  }
  return best
}

function select(level: Level | undefined): void {
  if (level) emit('update:modelValue', level.id)
}

function onScroll(): void {
  const index = nearestIndex()
  if (index === activeIndex.value) return
  activeIndex.value = index
  select(props.levels[index])
}

function onWheel(event: WheelEvent): void {
  const element = track.value
  if (!element) return
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  if (delta === 0) return
  // 横向已经到头就把滚轮还给页面，别把纵向滚动困在轮播里
  const maxScroll = element.scrollWidth - element.clientWidth
  const atEnd = delta > 0 && element.scrollLeft >= maxScroll - 1
  const atStart = delta < 0 && element.scrollLeft <= 0
  if (maxScroll <= 0 || atEnd || atStart) return
  event.preventDefault()
  if (typeof element.scrollBy === 'function') element.scrollBy({ left: delta })
  else element.scrollLeft += delta
}

function step(delta: number): void {
  const next = Math.min(props.levels.length - 1, Math.max(0, activeIndex.value + delta))
  if (next === activeIndex.value) return
  activeIndex.value = next
  select(props.levels[next])
  scrollToIndex(next, scrollBehavior())
}

function openActive(): void {
  const entry = entries.value[activeIndex.value]
  if (entry?.unlocked) emit('open', entry.level.id)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
    return
  }
  if (event.key !== 'Enter' && event.key !== ' ') return
  // 焦点在卡片上时由原生 click 负责，这里只接管容器自身的按键
  if (event.target !== track.value) return
  event.preventDefault()
  openActive()
}

watch(
  () => props.modelValue,
  (id) => {
    const index = indexOf(id)
    if (index >= 0) activeIndex.value = index
  },
  { immediate: true },
)

watch(
  () => props.levels,
  () => {
    const index = indexOf(props.modelValue)
    activeIndex.value = index < 0 ? 0 : index
    scrollToIndex(activeIndex.value, 'auto')
  },
)

onMounted(() => scrollToIndex(activeIndex.value, 'auto'))
</script>

<template>
  <div class="carousel">
    <div
      ref="track"
      class="carousel-track"
      role="group"
      aria-label="关卡轮播"
      tabindex="0"
      @wheel="onWheel"
      @keydown="onKeydown"
      @scroll="onScroll"
    >
      <LevelCard
        v-for="entry in entries"
        :key="entry.level.id"
        class="carousel-slot"
        :class="{ active: entry.level.id === activeId }"
        :level="entry.level"
        :unlocked="entry.unlocked"
        :completed="entry.cleared"
        @open="emit('open', entry.level.id)"
      />
    </div>

    <div class="carousel-bar">
      <button
        type="button"
        class="carousel-step"
        aria-label="上一关"
        :disabled="activeIndex === 0"
        @click="step(-1)"
      >
        ‹
      </button>
      <span class="carousel-position" aria-live="polite">{{ activeIndex + 1 }} / {{ props.levels.length }}</span>
      <button
        type="button"
        class="carousel-step"
        aria-label="下一关"
        :disabled="activeIndex === props.levels.length - 1"
        @click="step(1)"
      >
        ›
      </button>
    </div>
  </div>
</template>

<style scoped>
.carousel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.carousel-track {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.carousel-track:focus-visible {
  border-radius: var(--radius-lg);
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

/* 卡片宽度在这里改，预览图上限在 LevelCard.vue 的 .level-preview */
.carousel-slot {
  flex: 0 0 auto;
  width: min(28rem, 100%);
  scroll-snap-align: center;
}

/* 居中外圈用投影而不是边框，免得和完成、锁定态的边框颜色打架 */
.carousel-slot.active {
  box-shadow: 0 0 0 var(--border-pixel) var(--color-primary);
}

.carousel-bar {
  /* 控制条尺寸集中在这里调：按钮边长、按钮字号、位置计数字号 */
  --step-size: 2.75rem;
  --step-font: 1.5rem;
  --position-font: 0.95rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}

.carousel-step {
  width: var(--step-size);
  height: var(--step-size);
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--step-font);
  line-height: 1;
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.carousel-step:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.carousel-step:disabled {
  opacity: 0.4;
  cursor: default;
}

.carousel-position {
  min-width: 4.5rem;
  text-align: center;
  font-size: var(--position-font);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .carousel-track {
    scroll-behavior: auto;
  }
}
</style>
