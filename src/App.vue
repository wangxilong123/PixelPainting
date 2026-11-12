<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import { useGameSettings } from './composables/useGameSettings'

const route = useRoute()
const { immersive } = useGameSettings()

// 涂色页（关卡/自由）自带返回与设置，外壳让位给画布；其余板块走侧边栏
const isPlayPage = computed(() => route.name === 'game' || route.name === 'paint')
const showSidebar = computed(() => !isPlayPage.value)
</script>

<template>
  <div class="app-shell" :class="{ 'has-sidebar': showSidebar }">
    <AppSidebar v-if="showSidebar" />
    <div class="app-body" :class="{ 'with-tabbar': showSidebar }">
      <header v-if="showSidebar" class="app-header app-header-mobile">
        <h1>像素涂色</h1>
      </header>
      <main class="app-main" :class="{ immersive: immersive && isPlayPage }">
        <RouterView />
      </main>
    </div>
  </div>
</template>