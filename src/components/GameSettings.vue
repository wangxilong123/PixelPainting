<script setup lang="ts">
import { useGameSettings } from '../composables/useGameSettings'
import PixelIcon from './PixelIcon.vue'

defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const { soundEnabled, showRemaining, immersive, toggleSound, toggleRemaining, toggleImmersive } =
  useGameSettings()
</script>

<template>
  <div v-if="open" class="settings-drawer" role="dialog" aria-label="游戏设置">
    <label class="setting-row">
      <input type="checkbox" :checked="soundEnabled" @change="toggleSound" />
      <PixelIcon :name="soundEnabled ? 'sound-on' : 'sound-off'" />
      <span>音效</span>
    </label>
    <label class="setting-row">
      <input type="checkbox" :checked="showRemaining" @change="toggleRemaining" />
      <PixelIcon :name="showRemaining ? 'grid-on' : 'grid-off'" />
      <span>调色板剩余格数</span>
    </label>
    <label class="setting-row">
      <input type="checkbox" :checked="immersive" @change="toggleImmersive" />
      <PixelIcon :name="immersive ? 'compress' : 'expand'" />
      <span>沉浸模式</span>
    </label>
    <button type="button" class="settings-close" @click="emit('close')">
      <PixelIcon name="close" />
      <span>关闭</span>
    </button>
  </div>
</template>

<style scoped>
/* 抽屉挂在顶部栏下方靠右，避开画布中央 */
.settings-drawer {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: min(16rem, calc(100vw - 2rem));
  padding: var(--space-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: 0.9rem;
  cursor: pointer;
}

.setting-row input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-primary);
}

.settings-close {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.9rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
</style>
