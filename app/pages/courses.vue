<script setup lang="ts">
import type { CourseItem } from '~/composables/useMusicStore'

useHead({ title: '课程列表' })

const {
  courses,
  loadCourses,
  createCourse,
  reconfigureCourse,
  deleteCourse,
} = useMusicStore()
const { showToast, showLoadingToast } = useToast()

await useAsyncData('course-list-fetch', () => loadCourses())

const dialogOpen = ref(false)
const editing = ref<CourseItem | null>(null)

const openAdd = () => {
  editing.value = null
  dialogOpen.value = true
}

const openReconfigure = (course: CourseItem) => {
  editing.value = course
  dialogOpen.value = true
}

/** 创建 / 重新配置：服务端真实随机分配 */
const onConfirm = (payload: { title: string; date: string; count: number }) => {
  if (editing.value) {
    const id = editing.value.id
    showLoadingToast(
      '正在随机分配歌曲',
      () => reconfigureCourse(id, { title: payload.title, count: payload.count }),
      '课程已重新配置',
    )
  } else {
    showLoadingToast(
      '正在随机分配歌曲',
      () => createCourse(payload),
      '课程已添加并完成随机分配',
    )
  }
}

const startCourse = async (course: CourseItem) => {
  showToast(`即将开始「${course.title}」`)
  await navigateTo(`/play?course=${course.id}`)
}

/* ---------- 删除 ---------- */

const removeTarget = ref<CourseItem | null>(null)
const removeConfirmOpen = computed({
  get: () => removeTarget.value != null,
  set: (v: boolean) => {
    if (!v) removeTarget.value = null
  },
})

const onRemove = async () => {
  const target = removeTarget.value
  if (!target) return
  try {
    await deleteCourse(target.id)
    showToast(`已删除课程「${target.title}」`, { kind: 'success' })
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除课程失败', { kind: 'error' })
  }
}

/* ---------- 课程歌曲列表 ---------- */

const songsCourse = ref<CourseItem | null>(null)
const songsOpen = ref(false)

const openSongs = (course: CourseItem) => {
  songsCourse.value = course
  songsOpen.value = true
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">课程列表</h1>
        <p class="page-subtitle">
          已安排 {{ courses.length }} 节音乐课，点击「课程开始」进入播放
        </p>
      </div>
      <button class="btn btn-primary btn-lg add-course" type="button" @click="openAdd">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
        </svg>
        添加课程
      </button>
    </header>

    <div v-if="courses.length" class="course-grid">
      <CourseCard
        v-for="c in courses"
        :key="c.id"
        :course="c"
        @reconfigure="openReconfigure"
        @start="startCourse"
        @remove="removeTarget = $event"
        @songs="openSongs"
      />
    </div>

    <div v-else class="empty-state">
      <div class="glyph">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" stroke-width="1.8" />
          <path d="M3.5 9.5h17M8 2.8v4M16 2.8v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <path d="M8.5 14h7M8.5 17h4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </div>
      <h3>还没有课程</h3>
      <p>点击右上角「添加课程」，配置课程并随机分配歌曲</p>
    </div>

    <CourseDialog v-model="dialogOpen" :course="editing" @confirm="onConfirm" />

    <CourseSongsDialog v-model="songsOpen" :course="songsCourse" />

    <ConfirmDialog
      v-model="removeConfirmOpen"
      title="删除课程"
      :message="`确定删除「${removeTarget?.title ?? ''}」吗？该课程随机分配的歌曲将一并移除，此操作不可撤销。`"
      confirm-text="删除"
      @confirm="onRemove"
    />
  </div>
</template>

<style scoped>
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 20px;
}

.add-course {
  flex: none;
}

@media (max-width: 640px) {
  .page-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .add-course {
    align-self: stretch;
  }
}
</style>
