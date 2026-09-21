<script setup lang="ts">
import type { CourseItem } from '~/composables/useMusicStore'

const props = defineProps<{
  modelValue: boolean
  /** 传入课程则进入“重新配置”模式 */
  course?: CourseItem | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [payload: { title: string; date: string; count: number }]
}>()

const { todayISO, defaultCourseTitle } = useMusicStore()

const title = ref('')
const count = ref(10)
const countText = ref('10')

const isReconfigure = computed(() => !!props.course)
const open = computed(() => props.modelValue)

const clampCount = (n: number) => Math.min(30, Math.max(1, Math.round(n) || 1))

const reset = () => {
  const c = props.course
  title.value = c ? c.title : defaultCourseTitle()
  count.value = c ? c.count : 10
  countText.value = String(count.value)
}

watch(open, (v) => {
  document.documentElement.style.overflow = v ? 'hidden' : ''
  if (v) reset()
})

const close = () => emit('update:modelValue', false)

const onSlider = (e: Event) => {
  const n = clampCount(Number((e.target as HTMLInputElement).value))
  count.value = n
}

// 拖动条与数字输入框保持同步显示
watch(count, (n) => {
  countText.value = String(n)
})

const onCountInput = (e: Event) => {
  const el = e.target as HTMLInputElement
  countText.value = el.value
  const n = Number(el.value)
  if (Number.isNaN(n) || el.value === '') return
  count.value = clampCount(n)
}

const commitCount = () => {
  countText.value = String(count.value)
}

const trackFill = computed(
  () =>
    `linear-gradient(to right, var(--accent) 0%, var(--accent) ${
      ((count.value - 1) / 29) * 100
    }%, var(--fill) ${((count.value - 1) / 29) * 100}%)`,
)

const onConfirm = () => {
  emit('confirm', {
    title: title.value.trim() || defaultCourseTitle(),
    date: props.course?.date ?? todayISO(),
    count: clampCount(count.value),
  })
  close()
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && open.value) close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.documentElement.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog-overlay" @click.self="close">
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          :aria-label="isReconfigure ? '重新配置课程' : '添加课程'"
        >
          <h2 class="dialog-title">{{ isReconfigure ? '重新配置课程' : '添加课程' }}</h2>
          <p class="dialog-desc">
            {{
              isReconfigure
                ? '调整这次的课程标题与需要播放的音乐数量'
                : '配置课程标题与本次随机分配的音乐数量'
            }}
          </p>

          <div class="dialog-field">
            <label class="dialog-label" for="course-title">课程标题</label>
            <input
              id="course-title"
              v-model="title"
              class="text-input"
              type="text"
              maxlength="40"
              placeholder="例如：2025年9月5日课程"
            />
          </div>

          <div class="dialog-field">
            <div class="dialog-label">
              <label for="course-count">播放音乐数</label>
              <span class="value">{{ count }} 首</span>
            </div>
            <input
              id="course-count"
              class="slider"
              type="range"
              min="1"
              max="30"
              step="1"
              :value="count"
              :style="{ background: trackFill }"
              @input="onSlider"
            />
            <div class="count-row">
              <input
                class="count-input"
                type="number"
                min="1"
                max="30"
                step="1"
                :value="countText"
                aria-label="播放音乐数"
                @input="onCountInput"
                @blur="commitCount"
              />
              <span class="count-range">范围 1 – 30 首</span>
            </div>
          </div>

          <div class="dialog-actions">
            <button class="btn btn-secondary" type="button" @click="close">取消</button>
            <button class="btn btn-primary" type="button" @click="onConfirm">确定</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.count-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.count-input {
  width: 76px;
  border: 1px solid var(--separator);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
  padding: 8px 6px;
}

.count-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3.5px var(--accent-soft);
}

.count-range {
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
