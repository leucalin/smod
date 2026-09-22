// GET /api/bilibili/login/check?key=xxx —— 轮询扫码状态（成功后保存登录 cookie）
import { biliQrCheck } from '../../../utils/bilibili'

export default defineEventHandler(async (event) => {
  const key = String(getQuery(event).key ?? '').trim()
  if (!key) return { code: -400, message: '缺少登录 key' }

  try {
    const data = await biliQrCheck(key)
    return { code: 0, message: 'ok', data }
  } catch (err: any) {
    return { code: -1, message: '查询扫码状态异常：' + (err?.message ?? '未知错误') }
  }
})
