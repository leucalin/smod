<script setup lang="ts">
import type { ToastState } from '~/composables/useToast'

const { toasts } = useToast()
</script>

<template>
  <div class="toast-stack" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" role="status">
        <span v-if="t.kind === 'loading'" class="spinner" aria-hidden="true" />
        <span
          v-else-if="t.kind === 'success'"
          class="tick"
          aria-hidden="true"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
            <path d="m4.5 12.5 5 5 10-11" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span
          v-else-if="t.kind === 'error'"
          class="tick error"
          aria-hidden="true"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
          </svg>
        </span>
        <span>{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>
