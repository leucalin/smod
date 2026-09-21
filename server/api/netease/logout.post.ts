// POST /api/netease/logout —— 退出网易云登录
import { neteaseLogout } from '../../utils/netease'

export default defineEventHandler(async () => {
  try {
    await neteaseLogout()
    return { code: 0, message: 'ok' }
  } catch (err: any) {
    return { code: -1, message: '退出登录异常：' + (err?.message ?? '未知错误') }
  }
})
