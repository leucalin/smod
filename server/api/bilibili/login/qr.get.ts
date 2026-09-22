// GET /api/bilibili/login/qr —— 生成 bilibili 扫码登录二维码
import { biliQrGenerate } from '../../../utils/bilibili'

export default defineEventHandler(async () => {
  try {
    const data = await biliQrGenerate()
    if (!data?.key || !data.qrimg) {
      return { code: -1, message: '生成登录二维码失败，请稍后重试' }
    }
    return { code: 0, message: 'ok', data }
  } catch (err: any) {
    return { code: -1, message: '生成登录二维码异常：' + (err?.message ?? '未知错误') }
  }
})
