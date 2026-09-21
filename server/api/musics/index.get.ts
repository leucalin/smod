// GET /api/musics —— 音乐列表（新添加的在前）
import { listMusics } from '../../utils/db'

export default defineEventHandler(async () => {
  try {
    const items = await listMusics()
    return { code: 0, message: 'ok', data: { items } }
  } catch (err: any) {
    return { code: -1, message: '读取音乐列表失败：' + (err?.message ?? '未知错误') }
  }
})
