// GET /api/netease/login/qr —— 生成网易云扫码登录二维码
import { neteaseQrLogin } from '../../../utils/netease'

export default defineEventHandler(async () => {
  try {
    const data = await neteaseQrLogin()
    if (!data?.key || !data.qrimg) {
      return { code: -1, message: '生成登录二维码失败，请稍后重试' }
    }
    return { code: 0, message: 'ok', data }
  } catch (err: any) {
    return { code: -1, message: '生成登录二维码异常：' + (err?.message ?? '未知错误') }
  }
})
