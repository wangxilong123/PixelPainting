<script setup lang="ts">
import PixelIcon from './PixelIcon.vue'

defineProps<{ page: number; totalPages: number }>()

const emit = defineEmits<{ change: [page: number] }>()
</script>

<template>
  <nav v-if="totalPages > 1" class="pager" aria-label="素材分页">
    <button type="button" :disabled="page <= 1" @click="emit('change', page - 1)">
      <PixelIcon name="arrow-left" />
      <span>上一页</span>
    </button>
    <span class="pager-status" aria-live="polite">第 {{ page }} / {{ totalPages }} 页</span>
    <button type="button" :disabled="page >= totalPages" @click="emit('change', page + 1)">
      <span>下一页</span>
      <PixelIcon name="arrow-right" />
    </button>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}

.pager button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.pager button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}

.pager button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.pager .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

.pager-status {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>