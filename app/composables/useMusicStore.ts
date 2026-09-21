// ============================================================
// 音乐点播系统 · 前端状态
// 音乐列表持久化在 Neon Postgres（经 /api/musics），
// 课程暂存于内存（后续接入）
// ============================================================

export type Source = 'bilibili' | 'netease' | 'qqmusic' | 'local'

export interface MusicItem {
  id: string
  title: string
  source: Source
  artist: string
  album: string
  cover: string
  /** up 主，仅 bilibili 来源 */
  up?: string
  /** 时长文本，如 04:32 */
  duration?: string
  /** bilibili 稿件号 */
  bvid?: string
  aid?: number
  play?: number
  pubdate?: number
  /** 网易云歌曲 id */
  neteaseId?: number
}

export interface CourseItem {
  id: string
  title: string
  /** ISO 日期 yyyy-mm-dd */
  date: string
  count: number
  played: number
  unplayed: number
}

/** 课程随机分配的一首歌曲 */
export interface CourseSongItem {
  id: string
  position: number
  played: boolean
  music: MusicItem
}

export const SOURCE_META: Record<Source, { label: string; className: string }> = {
  bilibili: { label: 'bilibili', className: 'src-bilibili' },
  netease: { label: '网易云音乐', className: 'src-netease' },
  qqmusic: { label: 'QQ 音乐', className: 'src-qqmusic' },
  local: { label: '本地', className: 'src-local' },
}

export interface PagedSearchResult {
  items: MusicItem[]
  total: number
  page: number
  numPages: number
}

export interface BiliSearchResult extends PagedSearchResult {}

export interface NeteaseSearchResult extends PagedSearchResult {}

export const useMusicStore = () => {
  const musics = useState<MusicItem[]>('music-list', () => [])
  const musicsLoading = useState<boolean>('music-list-loading', () => false)
  const courses = useState<CourseItem[]>('course-list', () => [])
  const coursesLoading = useState<boolean>('course-list-loading', () => false)

  const callApi = async <T = any>(
    path: string,
    opts: Parameters<typeof $fetch>[1] = {},
  ): Promise<T> => {
    let res: { code: number; message?: string; data?: T }
    try {
      res = await $fetch(path, opts)
    } catch {
      throw new Error('网络异常，请检查网络连接')
    }
    if (res.code !== 0) {
      throw new Error(res.message || '操作失败，请稍后再试')
    }
    return res.data as T
  }

  /** 从数据库读取音乐列表（新添加的在前） */
  const loadMusics = async (): Promise<MusicItem[]> => {
    musicsLoading.value = true
    try {
      const res = await $fetch<{ code: number; message?: string; data?: { items: MusicItem[] } }>(
        '/api/musics',
      )
      if (res.code !== 0 || !res.data) {
        throw new Error(res.message || '读取音乐列表失败')
      }
      musics.value = res.data.items
      return res.data.items
    } finally {
      musicsLoading.value = false
    }
  }

  /**
   * 新增音乐（POST /api/musics，Neon 持久化；bilibili 按 bvid、网易云按 neteaseId 去重）
   * 成功返回新增记录；失败抛出 Error
   */
  const addMusic = async (music: MusicItem): Promise<MusicItem> => {
    if (music.bvid && isAddedByBvid(music.bvid)) {
      throw new Error('该音乐已添加')
    }
    if (music.neteaseId && isAddedByNeteaseId(music.neteaseId)) {
      throw new Error('该音乐已添加')
    }
    let res: { code: number; message?: string; data?: { item: MusicItem } }
    try {
      res = await $fetch('/api/musics', {
        method: 'POST',
        body: { ...music, id: undefined },
      })
    } catch {
      throw new Error('网络异常，无法保存音乐')
    }
    if (res.code === 409 && res.data?.item) {
      throw new Error('该音乐已添加')
    }
    if (res.code !== 0 || !res.data?.item) {
      throw new Error(res.message || '保存音乐失败')
    }
    const item = res.data.item
    musics.value = [item, ...musics.value.filter((m) => m.id !== item.id)]
    return item
  }

  /** 是否已添加（bilibili 来源按 bvid 匹配） */
  const isAddedByBvid = (bvid?: string) =>
    Boolean(bvid) && musics.value.some((m) => m.bvid === bvid)

  /** 是否已添加（网易云来源按歌曲 id 匹配） */
  const isAddedByNeteaseId = (neteaseId?: number) =>
    neteaseId != null && musics.value.some((m) => m.neteaseId === neteaseId)

  /** 删除音乐（服务端级联清除课程分配并重算统计） */
  const removeMusic = async (id: string) => {
    await callApi(`/api/musics/${id}`, { method: 'DELETE' })
    musics.value = musics.value.filter((m) => m.id !== id)
    // 课程统计可能受级联影响，刷新课程
    await loadCourses()
  }

  /* ---------- 课程 ---------- */

  /** 从数据库读取课程列表 */
  const loadCourses = async (): Promise<CourseItem[]> => {
    coursesLoading.value = true
    try {
      const { items } = await callApi<{ items: CourseItem[] }>('/api/courses')
      courses.value = items
      return items
    } finally {
      coursesLoading.value = false
    }
  }

  /** 创建课程（服务端随机分配歌曲） */
  const createCourse = async (payload: {
    title: string
    date: string
    count: number
  }): Promise<CourseItem> => {
    const { item } = await callApi<{ item: CourseItem }>('/api/courses', {
      method: 'POST',
      body: payload,
    })
    courses.value = [item, ...courses.value.filter((c) => c.id !== item.id)]
    return item
  }

  /** 重新配置课程（清空旧分配、重新随机） */
  const reconfigureCourse = async (
    id: string,
    payload: { title: string; count: number },
  ): Promise<CourseItem> => {
    const { item } = await callApi<{ item: CourseItem }>(`/api/courses/${id}`, {
      method: 'PUT',
      body: payload,
    })
    courses.value = courses.value.map((c) => (c.id === id ? item : c))
    return item
  }

  /** 删除课程（级联删除歌曲分配） */
  const deleteCourse = async (id: string) => {
    await callApi(`/api/courses/${id}`, { method: 'DELETE' })
    courses.value = courses.value.filter((c) => c.id !== id)
  }

  /** 课程随机分配的歌曲列表 */
  const loadCourseMusics = async (courseId: string): Promise<CourseSongItem[]> => {
    const { items } = await callApi<{ items: CourseSongItem[] }>(
      `/api/courses/${courseId}/musics`,
    )
    return items
  }

  /**
   * bilibili 视频搜索（经服务端代理 /api/bilibili/search，按页返回）
   * 失败时抛出 Error
   */
  const searchBilibili = async (
    keyword: string,
    page = 1,
  ): Promise<BiliSearchResult> => {
    let res: {
      code: number
      message?: string
      data?: BiliSearchResult
    }
    try {
      res = await $fetch('/api/bilibili/search', {
        query: { keyword, page },
      })
    } catch {
      throw new Error('网络异常，无法访问搜索服务')
    }
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '搜索失败，请稍后再试')
    }
    // B 站对高频翻页会临时限流：code=0 但该页 result 为空
    if (res.data.items.length === 0 && res.data.total > 0) {
      throw new Error('该页内容暂时不可用，请稍后再试')
    }
    return res.data
  }

  /**
   * 网易云歌曲搜索（经服务端代理 /api/netease/search，按页返回）
   * 失败时抛出 Error
   */
  const searchNetease = async (
    keywords: string,
    page = 1,
  ): Promise<NeteaseSearchResult> => {
    let res: {
      code: number
      message?: string
      data?: NeteaseSearchResult
    }
    try {
      res = await $fetch('/api/netease/search', {
        query: { keywords, page },
      })
    } catch {
      throw new Error('网络异常，无法访问搜索服务')
    }
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '网易云搜索失败，请稍后再试')
    }
    return res.data
  }

  /** 今天日期，如 2025-09-05 */
  const todayISO = () => {
    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
  }

  /** 默认课程标题，如 “2025年9月5日课程” */
  const defaultCourseTitle = () => {
    const d = new Date()
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日课程`
  }

  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return `${y}年${m}月${d}日`
  }

  return {
    musics,
    musicsLoading,
    courses,
    coursesLoading,
    loadMusics,
    addMusic,
    removeMusic,
    isAddedByBvid,
    loadCourses,
    createCourse,
    reconfigureCourse,
    deleteCourse,
    loadCourseMusics,
    searchBilibili,
    searchNetease,
    isAddedByNeteaseId,
    todayISO,
    defaultCourseTitle,
    formatDate,
  }
}
