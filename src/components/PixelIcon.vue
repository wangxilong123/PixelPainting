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
</style>
