// 轻量 Toast：单条槽位，后者覆盖前者

export interface ToastState {
  id: number
  text: string
  kind: 'loading' | 'success' | 'info' | 'error'
}

let toastSeq = 0
let hideTimer: ReturnType<typeof setTimeout> | null = null

export const useToast = () => {
  const toasts = useState<ToastState[]>('toasts', () => [])

  const dismiss = (id: number) => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
    if (!toasts.value.length && hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  const showToast = (
    text: string,
    opts: { kind?: ToastState['kind']; duration?: number } = {},
  ) => {
    const { kind = 'info', duration = 2200 } = opts
    const id = ++toastSeq
    toasts.value = [{ id, text, kind }]
    if (hideTimer) clearTimeout(hideTimer)
    if (kind !== 'loading') {
      hideTimer = setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  /**
   * 加载态 toast：任务完成后转成功态，失败转错误态
   * then 可返回 Promise（如等待 API 完成）
   */
  const showLoadingToast = (
    text: string,
    then: () => void | Promise<unknown>,
    successText = text,
  ) => {
    const id = showToast(text, { kind: 'loading', duration: 0 })
    const finish = (kind: 'success' | 'error', msg: string) => {
      toasts.value = toasts.value.map((t) =>
        t.id === id ? { ...t, kind, text: msg } : t,
      )
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = setTimeout(() => dismiss(id), 2200)
    }
    Promise.resolve()
      .then(then)
      .then(() => finish('success', successText))
      .catch((err: unknown) =>
        finish('error', err instanceof Error ? err.message : '操作失败'),
      )
  }

  return { toasts, showToast, showLoadingToast, dismiss }
}
