<script setup lang="ts">
import { useRoute } from 'vue-router'
import PixelIcon from './PixelIcon.vue'
import type { IconName } from './icons'

const route = useRoute()

const entries: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '素材', icon: 'materials' },
  { to: '/collections', label: '合集', icon: 'collections' },
  { to: '/studio', label: '制作像素图', icon: 'studio' },
  { to: '/profile', label: '个人中心', icon: 'profile' },
  { to: '/levels', label: '关卡模式', icon: 'levels' },
]

// '/' 是其余路径的前缀，RouterLink 的包含匹配会让它到处亮，只能精确判断
function isActive(to: string): boolean {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <nav class="app-sidebar" aria-label="板块导航">
    <h1 class="sidebar-brand">
      <RouterLink to="/">像素涂色</RouterLink>
    </h1>
    <div class="sidebar-links">
      <RouterLink
        v-for="entry in entries"
        :key="entry.to"
        :to="entry.to"
        class="sidebar-link"
        :class="{ active: isActive(entry.to) }"
        :aria-current="isActive(entry.to) ? 'page' : undefined"
      >
        <PixelIcon :name="entry.icon" />
        <span>{{ entry.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.app-sidebar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--space-6);
  width: var(--sidebar-width);
  height: 100vh;
  padding: var(--space-6) var(--space-4);
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow-y: auto;
}

.sidebar-brand {
  font-size: var(--font-brand);
}

.sidebar-brand a {
  color: var(--color-text);
  text-decoration: none;
}

.sidebar-links {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  font-size: var(--font-nav);
  text-decoration: none;
  transition: border-color var(--transition-fast), background-color var(--transition-fast),
    color var(--transition-fast);
}

.sidebar-link .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.sidebar-link:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.sidebar-link.active {
  border-color: var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-weight: 600;
}

@media (max-width: 640px) {
  .app-sidebar {
    position: fixed;
    inset: auto 0 0 0;
    flex-direction: row;
    align-items: center;
    width: 100%;
    height: auto;
    padding: var(--space-1) var(--space-2);
    border-right: none;
    border-top: 1px solid var(--color-border);
    overflow: visible;
  }

  .sidebar-brand {
    display: none;
  }

  .sidebar-links {
    flex-direction: row;
    justify-content: space-between;
    width: 100%;
    gap: 0;
  }

  .sidebar-link {
    flex: 1 1 0;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.3rem 0.1rem;
    border-width: 1px;
    font-size: var(--font-tabbar);
    text-align: center;
  }

  .sidebar-link .pixel-icon {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }
}
</style>