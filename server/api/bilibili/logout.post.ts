// POST /api/bilibili/logout —— 退出 bilibili 登录
import { biliLogout } from '../../utils/bilibili'

export default defineEventHandler(async () => {
  try {
    await biliLogout()
    return { code: 0, message: 'ok' }
  } catch (err: any) {
    return { code: -1, message: '退出登录异常：' + (err?.message ?? '未知错误') }
  }
})
