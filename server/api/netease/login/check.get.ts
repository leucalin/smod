// GET /api/netease/login/check?key=xxx —— 轮询扫码状态（803 成功时保存登录 cookie）
import { neteaseQrCheck } from '../../../utils/netease'

export default defineEventHandler(async (event) => {
  const key = String(getQuery(event).key ?? '').trim()
  if (!key) return { code: -400, message: '缺少登录 key' }

  try {
    const data = await neteaseQrCheck(key)
    return { code: 0, message: 'ok', data }
  } catch (err: any) {
    return { code: -1, message: '查询扫码状态异常：' + (err?.message ?? '未知错误') }
  }
})
