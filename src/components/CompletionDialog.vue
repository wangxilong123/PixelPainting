<script setup lang="ts">
import { computed } from 'vue'
import type { Level } from '../models/level'
import PixelPreview from './PixelPreview.vue'

const props = defineProps<{
  open: boolean
  stars: 1 | 2 | 3
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
      <PixelPreview v-if="level" class="dialog-preview" :level="level" />
      <p class="dialog-stars" aria-label="本次星级">{{ '★'.repeat(stars) }}{{ '☆'.repeat(3 - stars) }}</p>
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
  width: min(12rem, 100%);
  margin: var(--space-4) auto 0;
}

.dialog-stars {
  margin: var(--space-4) 0;
  color: var(--color-primary);
  font-size: 1.6rem;
  letter-spacing: 0.3rem;
}

.dialog-stats {
  margin: 0 0 var(--space-6);
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
