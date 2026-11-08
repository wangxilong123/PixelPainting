<script setup lang="ts">
import { computed } from 'vue'
import type { Level } from '../models/level'
import PixelPreview from './PixelPreview.vue'

const props = defineProps<{
  open: boolean
  elapsedSeconds: number
  hintsUsed: number
  nextLevelId?: string
  level?: Level
}>()

const emit = defineEmits<{ next: []; replay: []; back: [] }>()

const time = computed(() => {
  const minutes = String(Math.floor(props.elapsedSeconds / 60)).padStart(2, '0')
  const seconds = String(props.elapsedSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
})
</script>

<template>
  <div v-if="open" class="dialog-backdrop">
    <div role="dialog" aria-modal="true" aria-label="关卡结算" class="completion-dialog">
      <h2>关卡完成！</h2>
      <img
        v-if="level?.thumbnail"
        class="dialog-preview"
        :src="level.thumbnail"
        :alt="`${level.title} 完成图`"
      />
      <PixelPreview v-else-if="level" class="dialog-preview" :level="level" />
      <ul class="dialog-stats">
        <li>用时 {{ time }}</li>
        <li>提示 {{ hintsUsed }} 次</li>
      </ul>
      <div class="dialog-actions">
        <button v-if="nextLevelId" type="button" class="primary" @click="emit('next')">下一关</button>
        <button type="button" @click="emit('replay')">再玩一次</button>
        <button type="button" @click="emit('back')">返回列表</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 65%);
  padding: var(--space-4);
}

.completion-dialog {
  width: min(24rem, 100%);
  padding: var(--space-6);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  text-align: center;
}

.dialog-preview {
  width: min(20rem, 100%);
  margin: var(--space-4) auto 0;
}

/* 缩略图按原画比例显示；DOM 格子预览靠 aspect-ratio 撑高，不能套 max-height */
img.dialog-preview {
  max-height: 20rem;
  object-fit: contain;
  /* 缩略图就是关卡格子图，放大要看到硬边像素，和涂色画面一致 */
  image-rendering: pixelated;
}

.dialog-stats {
  margin: var(--space-4) 0 var(--space-6);
  padding: 0;
  list-style: none;
  display: flex;
  justify-content: center;
  gap: var(--space-6);
  color: var(--color-text-muted);
}

.dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-4);
}

.dialog-actions button {
  padding: 0.5rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.dialog-actions button.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-background);
  font-weight: 600;
}
</style>
