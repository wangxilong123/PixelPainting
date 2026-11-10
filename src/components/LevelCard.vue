<script setup lang="ts">
import { computed } from 'vue'
import type { Level } from '../models/level'
import { getInteractiveCellCount } from '../services/levelService'
import PixelPreview from './PixelPreview.vue'
import PixelIcon from './PixelIcon.vue'

const props = defineProps<{
  level: Level
  unlocked: boolean
  completed: boolean
}>()

const emit = defineEmits<{ open: [] }>()

const difficultyLabels = ['', '简单', '普通', '进阶']

const cellCount = computed(() => getInteractiveCellCount(props.level))

function activate(): void {
  if (props.unlocked) emit('open')
}
</script>

<template>
  <button
    type="button"
    class="level-card"
    :class="{ locked: !unlocked, completed }"
    :data-level-id="level.id"
    :aria-disabled="unlocked ? undefined : 'true'"
    @click="activate"
  >
    <span class="level-figure" :class="{ portrait: level.height > level.width }">
      <img v-if="level.thumbnail" class="level-preview" :src="level.thumbnail" :alt="level.title" />
      <PixelPreview v-else class="level-preview" :level="level" />
    </span>
    <span class="level-title">{{ level.title }}</span>
    <span class="level-meta">
      {{ difficultyLabels[level.difficulty] }} · {{ level.width }}×{{ level.height }} · {{ cellCount }} 格
    </span>
    <span class="level-status">
      <span v-if="!unlocked" class="level-badge">
        <PixelIcon name="lock" :size="12" />
        <span>锁定</span>
      </span>
      <span v-else-if="completed" class="level-badge done">
        <PixelIcon name="check" :size="12" />
        <span>已完成</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.level-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: var(--space-4);
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  transition: transform var(--transition-fast), border-color var(--transition-fast),
    background-color var(--transition-fast);
}

.level-card:hover:not(.locked) {
  border-color: var(--color-border-strong);
  transform: translateY(-2px);
}

/* 完成态只改边框和底色，不整块换色 */
.level-card.completed {
  border-color: var(--color-primary);
  background: var(--color-surface-raised);
}

.level-card.locked {
  cursor: not-allowed;
  opacity: 0.55;
}

/* 预览区是固定的正方形盒子，卡片高度就跟关卡的宽高比和当前筛选无关；
   图片贴底，配上等高的状态行，一排卡片的图片底边落在同一条水平线上 */
.level-figure {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  /* 和 .level-preview 的 max-width 保持一致 */
  height: 20rem;
}

.level-preview {
  width: 100%;
  max-width: 20rem;
  max-height: 100%;
  object-fit: contain;
}

/* 竖图按盒子高度驱动，不然会被 max-height 压扁 */
.portrait .level-preview {
  width: auto;
  height: 100%;
}

/* 缩略图就是关卡格子图，放大要看到硬边像素，和涂色画面一致 */
img.level-preview {
  image-rendering: pixelated;
}

.level-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 1.5rem;
}

.level-title {
  font-weight: 600;
}

.level-meta {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.level-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.level-badge.done {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
</style>
