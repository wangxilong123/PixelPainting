<script setup lang="ts">
import { useGameSettings } from './composables/useGameSettings'

const { immersive } = useGameSettings()
</script>

<template>
  <div class="app-shell">
    <header v-if="!immersive" class="app-header">
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
