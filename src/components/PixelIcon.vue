<script setup lang="ts">
import { iconPaths, type IconName } from './icons'

withDefaults(
  defineProps<{
    name: IconName
    size?: number
  }>(),
  { size: 16 },
)
</script>

<template>
  <svg
    class="pixel-icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="currentColor"
    shape-rendering="crispEdges"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(d, index) in iconPaths[name]" :key="index" :d="d" />
  </svg>
</template>

<style scoped>
.pixel-icon {
  display: block;
  flex: none;
}
</style>
