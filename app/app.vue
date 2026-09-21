<script setup lang="ts">
useHead({
  titleTemplate: (title) =>
    title ? `${title} · 祁阳一中音乐课歌曲智能点播系统` : '祁阳一中音乐课歌曲智能点播系统',
})

const nav = [
  {
    to: '/music',
    label: '音乐列表',
    icon: 'music',
  },
  {
    to: '/courses',
    label: '课程列表',
    icon: 'courses',
  },
  {
    to: '/play',
    label: '播放页面',
    icon: 'play',
  },
] as const
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 18.5V6.2c0-.4.27-.75.66-.85l8-2.1c.55-.15 1.09.27 1.09.84v12.6"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
            />
            <circle cx="6.6" cy="18.5" r="2.6" fill="currentColor" />
            <circle cx="16.3" cy="16.7" r="2.6" fill="currentColor" />
          </svg>
        </div>
        <div>
          <div class="brand-name">祁阳一中 · 音乐点播</div>
          <div class="brand-sub">音乐课歌曲智能点播系统</div>
        </div>
      </div>

      <nav class="nav" aria-label="主导航">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
        >
          <!-- 音乐列表 -->
          <svg
            v-if="item.icon === 'music'"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 18.5V6.2c0-.4.27-.75.66-.85l8-2.1c.55-.15 1.09.27 1.09.84v12.6"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <circle cx="6.6" cy="18.5" r="2.6" fill="currentColor" />
            <circle cx="16.3" cy="16.7" r="2.6" fill="currentColor" />
          </svg>
          <!-- 课程列表 -->
          <svg
            v-else-if="item.icon === 'courses'"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="3.5"
              y="5"
              width="17"
              height="15.5"
              rx="3"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path
              d="M3.5 9.5h17M8 2.8v4M16 2.8v4"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M8.5 14h7M8.5 17h4.5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          <!-- 播放页面 -->
          <svg
            v-else
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path
              d="M10 8.8a.8.8 0 0 1 1.22-.68l5 3.2a.8.8 0 0 1 0 1.36l-5 3.2A.8.8 0 0 1 10 15.2V8.8Z"
              fill="currentColor"
            />
          </svg>
          <span class="label">{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-foot">
        祁阳一中音乐课歌曲智能点播系统<br />UI 演示版 · v0.1
      </div>
    </aside>

    <main class="main">
      <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
    </main>

    <ToastStack />
  </div>
</template>
