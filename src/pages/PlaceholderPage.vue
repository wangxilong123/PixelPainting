<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PixelIcon from '../components/PixelIcon.vue'
import type { IconName } from '../components/icons'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? '建设中'))
const icon = computed<IconName>(() => (route.meta.icon as IconName | undefined) ?? 'studio')
</script>

<template>
  <div class="placeholder-page">
    <PixelIcon :name="icon" class="placeholder-icon" />
    <h2>{{ title }}</h2>
    <p>该板块建设中，敬请期待。</p>
    <RouterLink class="placeholder-back" to="/">返回素材库</RouterLink>
  </div>
</template>

<style scoped>
.placeholder-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  text-align: center;
}

.placeholder-icon {
  width: 3rem;
  height: 3rem;
}

.placeholder-page p {
  margin: 0;
  color: var(--color-text-muted);
}

.placeholder-back {
  color: var(--color-primary);
}
</style>