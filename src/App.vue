<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useGameSettings } from './composables/useGameSettings'

const route = useRoute()
const { immersive } = useGameSettings()

// 游戏页顶栏已经有返回、关卡名和设置，全局顶栏只会白占一截画布高度
const showAppHeader = computed(() => !immersive.value && route.name !== 'game')
</script>

<template>
  <div class="app-shell">
    <header v-if="showAppHeader" class="app-header">
      <h1>像素涂色</h1>
      <nav class="app-nav" aria-label="主导航">
        <RouterLink to="/levels">进入关卡列表</RouterLink>
      </nav>
    </header>

    <main class="app-main" :class="{ immersive }">
      <RouterView />
    </main>
  </div>
</template>
