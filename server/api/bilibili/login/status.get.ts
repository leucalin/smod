// GET /api/bilibili/login/status —— 查询 bilibili 登录状态
import { biliLoginStatus } from '../../../utils/bilibili'

export default defineEventHandler(async () => {
  try {
    const data = await biliLoginStatus()
    return { code: 0, message: 'ok', data }
  } catch (err: any) {
    return { code: -1, message: '查询登录状态异常：' + (err?.message ?? '未知错误') }
  }
})
