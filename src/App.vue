<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>像素涂色</h1>
      <nav class="app-nav" aria-label="主导航">
        <RouterLink to="/levels">进入关卡列表</RouterLink>
      </nav>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
