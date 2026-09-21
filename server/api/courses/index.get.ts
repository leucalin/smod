// GET /api/courses —— 课程列表（新创建的在前）
import { listCourses } from '../../utils/db'

export default defineEventHandler(async () => {
  try {
    const items = await listCourses()
    return { code: 0, message: 'ok', data: { items } }
  } catch (err: any) {
    return { code: -1, message: '读取课程列表失败：' + (err?.message ?? '未知错误') }
  }
})
