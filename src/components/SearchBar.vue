<script setup lang="ts">
import PixelIcon from './PixelIcon.vue'

const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="search-bar">
    <PixelIcon name="search" class="search-icon" />
    <input
      v-model="model"
      type="search"
      class="search-input"
      placeholder="搜索素材名称或标签"
      aria-label="搜索素材"
    >
    <button
      v-if="model !== ''"
      type="button"
      class="search-clear"
      aria-label="清空搜索"
      @click="model = ''"
    >
      <PixelIcon name="close" />
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.5rem 0.75rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  transition: border-color var(--transition-fast);
}

.search-bar:focus-within {
  border-color: var(--color-focus);
}

.search-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.search-input:focus-visible {
  outline: none;
}

/* 原生 search 清除按钮和自定义清除按钮会重复，只留自定义的 */
.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}

.search-clear:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.search-clear .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}
</style>