<script setup lang="ts">
import { computed } from 'vue'
import type { IconName } from './icons'
import { resolveIcon } from './iconSvg'

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: number
  }>(),
  { size: 16 },
)

const source = computed(() => resolveIcon(props.name))
</script>

<template>
  <svg
    class="pixel-icon"
    :data-name="name"
    :width="size"
    :height="size"
    :viewBox="source.viewBox"
    :data-optical="source.optical ? '' : undefined"
    fill="currentColor"
    :shape-rendering="source.crisp ? 'crispEdges' : undefined"
    aria-hidden="true"
    focusable="false"
    v-html="source.body"
  />
</template>

<style scoped>
.pixel-icon {
  display: block;
  flex: none;
}

/* viewBox 已裁到着墨边缘，再按全局旋钮统一缩出留白；布局盒保持 size×size 不变 */
.pixel-icon[data-optical] {
  transform: scale(var(--icon-ink-ratio));
}
</style>
