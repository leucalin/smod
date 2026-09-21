<script setup lang="ts">
// 通用确认弹窗（用于删除等破坏性操作）
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    message: string
    confirmText?: string
    /** 确认按钮是否为警告色 */
    danger?: boolean
  }>(),
  { confirmText: '删除', danger: true },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const open = computed(() => props.modelValue)

watch(open, (v) => {
  document.documentElement.style.overflow = v ? 'hidden' : ''
})

const close = () => emit('update:modelValue', false)

const onConfirm = () => {
  emit('confirm')
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
        <div class="dialog-card confirm-card" role="alertdialog" aria-modal="true" :aria-label="title">
          <h2 class="dialog-title">{{ title }}</h2>
          <p class="dialog-desc confirm-message">{{ message }}</p>
          <div class="dialog-actions">
            <button class="btn btn-secondary" type="button" @click="close">取消</button>
            <button
              class="btn"
              :class="danger ? 'btn-danger' : 'btn-primary'"
              type="button"
              @click="onConfirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-card {
  width: min(400px, 100%);
}

.confirm-message {
  font-size: 14px;
  line-height: 1.55;
  margin-top: 10px;
}
</style>
