// GET /api/netease/login/status —— 查询当前网易云登录状态
import { neteaseLoginStatus } from '../../../utils/netease'

export default defineEventHandler(async () => {
  try {
    const data = await neteaseLoginStatus()
    return { code: 0, message: 'ok', data }
  } catch (err: any) {
    return { code: -1, message: '查询登录状态异常：' + (err?.message ?? '未知错误') }
  }
})
