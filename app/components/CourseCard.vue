<script setup lang="ts">
import type { CourseItem } from '~/composables/useMusicStore'

defineProps<{
  course: CourseItem
}>()

const emit = defineEmits<{
  reconfigure: [course: CourseItem]
  start: [course: CourseItem]
  remove: [course: CourseItem]
  songs: [course: CourseItem]
}>()

const { formatDate } = useMusicStore()
</script>

<template>
  <article class="card course-card">
    <header class="head">
      <div class="head-main">
        <h3 class="title">{{ course.title }}</h3>
        <p class="date">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" stroke-width="1.8" />
            <path d="M3.5 9.5h17M8 2.8v4M16 2.8v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          {{ formatDate(course.date) }}
        </p>
      </div>
      <div class="head-actions">
        <span class="num-pill">共 {{ course.count }} 首</span>
        <button
          class="delete-btn"
          type="button"
          :aria-label="`删除课程：${course.title}`"
          title="删除课程"
          @click="emit('remove', course)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.5 7h15M9.5 7V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2V7m-8.6 0 .9 12.1c.06.75.68 1.33 1.43 1.33h6.94c.75 0 1.37-.58 1.43-1.33L17.5 7M10 11v6M14 11v6"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </header>

    <div class="stats">
      <div class="stat">
        <span class="stat-num">{{ course.count }}</span>
        <span class="stat-label">音乐数量</span>
      </div>
      <div class="stat">
        <span class="stat-num played">{{ course.played }}</span>
        <span class="stat-label">已播放</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ course.unplayed }}</span>
        <span class="stat-label">未播放</span>
      </div>
      <div class="bar" :title="`已播放 ${course.played} / 未播放 ${course.unplayed}`">
        <span
          class="bar-done"
          :style="{ width: `${course.count ? (course.played / course.count) * 100 : 0}%` }"
        />
      </div>
    </div>

    <footer class="actions">
      <button class="btn btn-secondary" type="button" @click="emit('reconfigure', course)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path d="m14.5 7 3 3" stroke="currentColor" stroke-width="1.8" />
        </svg>
        重新配置
      </button>
      <button class="btn btn-secondary" type="button" @click="emit('songs', course)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 18.5V6.2c0-.4.27-.75.66-.85l8-2.1c.55-.15 1.09.27 1.09.84v12.6"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
          <circle cx="6.6" cy="18.5" r="2.6" fill="currentColor" />
          <circle cx="16.3" cy="16.7" r="2.6" fill="currentColor" />
        </svg>
        课程歌曲列表
      </button>
      <button class="btn btn-primary" type="button" @click="emit('start', course)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7.5 5.6a1 1 0 0 1 1.53-.85l11 6.4a1 1 0 0 1 0 1.7l-11 6.4a1 1 0 0 1-1.53-.85V5.6Z" />
        </svg>
        课程开始
      </button>
    </footer>
  </article>
</template>

<style scoped>
.course-card {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: transform 0.32s var(--spring-pop), box-shadow 0.25s ease-out;
}

.course-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-2);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.head-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 删除按钮：常显 */
.delete-btn {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--fill);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: transform 0.28s var(--spring-pop),
    background-color 0.15s ease-out, color 0.15s ease-out;
}

.delete-btn:hover {
  background: var(--danger);
  color: #fff;
}

.delete-btn:active {
  transform: scale(0.88);
  transition: transform 0.1s ease-out;
}

.title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.012em;
  line-height: 1.3;
}

.date {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.num-pill {
  flex: none;
  padding: 4px 11px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 14px 0;
  border-top: 1px solid var(--separator);
  border-bottom: 1px solid var(--separator);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.stat-num {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.015em;
}

.stat-num.played {
  color: var(--accent);
}

.stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.bar {
  grid-column: 1 / -1;
  height: 4px;
  border-radius: 2px;
  background: var(--fill);
  overflow: hidden;
}

.bar-done {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.4s var(--spring-sheet);
}

.actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
