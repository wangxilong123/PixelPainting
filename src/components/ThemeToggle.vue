<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '../composables/useTheme'
import PixelIcon from './PixelIcon.vue'

const { isLight, toggleTheme } = useTheme()
const label = computed(() => (isLight.value ? '浅色' : '深色'))
const action = computed(() => (isLight.value ? '切换到深色主题' : '切换到浅色主题'))
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :aria-label="action"
    :title="action"
    @click="toggleTheme"
  >
    <PixelIcon :name="isLight ? 'sun' : 'moon'" />
    <span class="theme-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.9rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-chip);
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast),
    color var(--transition-fast);
}

.theme-toggle:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.theme-toggle .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

.theme-label {
  font-variant-numeric: tabular-nums;
}
</style>