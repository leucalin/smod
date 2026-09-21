// POST /api/courses —— 创建课程并随机分配歌曲
// body: { title, date, count }
import { createCourse } from '../../utils/db'

export default defineEventHandler(async (event) => {
  let body: Record<string, any>
  try {
    body = await readBody(event)
  } catch {
    return { code: -400, message: '请求体不是合法的 JSON' }
  }

  try {
    const course = await createCourse(body ?? {})
    if (!course) return { code: -400, message: '缺少课程标题 title 或日期 date' }
    return { code: 0, message: 'ok', data: { item: course } }
  } catch (err: any) {
    return { code: -1, message: '创建课程失败：' + (err?.message ?? '未知错误') }
  }
})
