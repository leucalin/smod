// POST /api/musics —— 新增音乐（bilibili 来源按 bvid 去重）
import { insertMusic } from '../../utils/db'

export default defineEventHandler(async (event) => {
  let body: Record<string, any>
  try {
    body = await readBody(event)
  } catch {
    return { code: -400, message: '请求体不是合法的 JSON' }
  }

  try {
    const result = await insertMusic(body ?? {})
    if (!result) return { code: -400, message: '缺少音乐标题 title' }
    if (result.code === 1) {
      return { code: 409, message: '该音乐已添加', data: { item: result.item } }
    }
    return { code: 0, message: 'ok', data: { item: result.item } }
  } catch (err: any) {
    return { code: -1, message: '保存音乐失败：' + (err?.message ?? '未知错误') }
  }
})
