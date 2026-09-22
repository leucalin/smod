// ============================================================
// 数据存储层（音乐 + 课程）
// - 配置 DATABASE_URL 时：使用 Neon (Postgres) 持久化，首次访问自动建表
// - 未配置时：内存降级（演示数据，重启后重置）
// ============================================================

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

/* ---------- 类型 ---------- */

export interface MusicRow {
  id: string
  title: string
  source: string
  artist: string
  album: string
  cover: string
  up?: string
  duration?: string
  bvid?: string
  aid?: number
  play?: number
  pubdate?: number
  /** 网易云歌曲 id */
  neteaseId?: number
  /** bilibili 视频标签（逗号分隔） */
  tags?: string
  /** 已从音乐列表移除（软删除，课程分配记录保留） */
  removed?: boolean
}

export interface CourseRow {
  id: string
  title: string
  date: string
  count: number
  played: number
  unplayed: number
}

export interface CourseSongRow {
  id: string
  position: number
  played: boolean
  music: MusicRow
}

/* ---------- 内存降级（无 DATABASE_URL 时） ---------- */

const memCover = (seed: string) => `https://picsum.photos/seed/${seed}/640/360`

let memMusics: MusicRow[] = [
  {
    id: 'm1',
    title: '平凡之路 （官方 MV）',
    source: 'bilibili',
    artist: '朴树',
    album: '后会无期 电影原声带',
    cover: memCover('smod-fanfan'),
    up: '朴树官方频道',
    duration: '05:02',
  },
  {
    id: 'm2',
    title: '起风了 （完整版 MV）',
    source: 'bilibili',
    artist: '买辣椒也用券',
    album: '起风了',
    cover: memCover('smod-qifeng'),
    up: '音乐现场',
    duration: '04:58',
  },
  {
    id: 'm3',
    title: '稻香 （MV）',
    source: 'bilibili',
    artist: '周杰伦',
    album: '魔杰座',
    cover: memCover('smod-daoxiang'),
    up: '周杰伦点歌台',
    duration: '03:43',
  },
  {
    id: 'm4',
    title: '成都 （现场版）',
    source: 'bilibili',
    artist: '赵雷',
    album: '无法长大',
    cover: memCover('smod-chengdu'),
    up: '民谣公社',
    duration: '05:28',
  },
  {
    id: 'm5',
    title: '海阔天空 （Live）',
    source: 'bilibili',
    artist: 'Beyond',
    album: '乐与怒',
    cover: memCover('smod-haikuo'),
    up: '经典粤语金曲',
    duration: '05:32',
  },
  {
    id: 'm6',
    title: '虫儿飞 （童声版）',
    source: 'bilibili',
    artist: '郑伊健',
    album: '风云 · 雄霸天下',
    cover: memCover('smod-chonger'),
    up: '童年金曲馆',
    duration: '04:11',
  },
]

interface MemCourseMusic {
  id: string
  courseId: string
  musicId: string
  position: number
  isPlayed: boolean
}

let memCourses: CourseRow[] = []
let memCourseMusics: MemCourseMusic[] = []
let memSeq = 0

const memNextId = (prefix: string) => `${prefix}-${Date.now()}-${++memSeq}`

const pickRandom = <T>(arr: T[], count: number): T[] =>
  [...arr].sort(() => Math.random() - 0.5).slice(0, count)

/* ---------- Neon (Postgres) ---------- */

let sql: NeonQueryFunction | null = null
let schemaReady = false

export const hasDb = () => Boolean(process.env.DATABASE_URL)

function getSql(): NeonQueryFunction {
  if (!sql) sql = neon(process.env.DATABASE_URL!)
  return sql
}

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS musics (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'bilibili',
  artist TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  up TEXT,
  duration TEXT,
  bvid TEXT UNIQUE,
  aid BIGINT,
  play BIGINT,
  pubdate BIGINT,
  netease_id BIGINT,
  tags TEXT,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`,
  `ALTER TABLE musics ADD COLUMN IF NOT EXISTS netease_id BIGINT;`,
  `ALTER TABLE musics ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;`,
  `ALTER TABLE musics ADD COLUMN IF NOT EXISTS tags TEXT;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_musics_netease
  ON musics(netease_id) WHERE netease_id IS NOT NULL;`,
  `CREATE TABLE IF NOT EXISTS courses (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  played INT NOT NULL DEFAULT 0,
  unplayed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`,
  `CREATE TABLE IF NOT EXISTS course_musics (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  music_id BIGINT NOT NULL REFERENCES musics(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  is_played BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`,
  `CREATE INDEX IF NOT EXISTS idx_course_musics_course ON course_musics(course_id);`,
  `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`,
]


/**
 * 首次访问时自动建表（幂等）
 * 注意：Neon 驱动的 sql 只能以 tagged template 或 sql.query(字符串) 调用，
 * 因此这里逐条执行，避免多语句与调用形式限制
 */
export async function ensureSchema(): Promise<void> {
  if (!hasDb() || schemaReady) return
  const s = getSql()
  try {
    for (const statement of DDL_STATEMENTS) {
      await s.query(statement)
    }
    schemaReady = true
  } catch (err) {
    console.error(
      '[db] 初始化数据表失败：',
      err instanceof Error ? err.message : err,
    )
    throw err
  }
}

/** 随机抽取 count 首并写入分配（已存在分配则先清空；可同时更新标题） */
async function assignRandomDb(
  s: NeonQueryFunction,
  courseId: number,
  count: number,
  title?: string,
) {
  const titleUpdate = title
    ? s`UPDATE courses SET title = ${title} WHERE id = ${courseId}`
    : s`SELECT 1`
  await s.transaction([
    s`DELETE FROM course_musics WHERE course_id = ${courseId}`,
    s`INSERT INTO course_musics (course_id, music_id)
       SELECT ${courseId}, id FROM musics WHERE removed_at IS NULL ORDER BY random() LIMIT ${count}`,
    titleUpdate,
    s`UPDATE courses c SET
         count = (SELECT count(*) FROM course_musics cm WHERE cm.course_id = ${courseId}),
         played = 0,
         unplayed = (SELECT count(*) FROM course_musics cm WHERE cm.course_id = ${courseId})
       WHERE c.id = ${courseId}`,
  ])
}

/* ---------- 行映射 ---------- */

const rowToMusic = (row: Record<string, any>): MusicRow => ({
  id: String(row.id),
  title: row.title,
  source: row.source,
  artist: row.artist ?? '',
  album: row.album ?? '',
  cover: row.cover ?? '',
  up: row.up ?? undefined,
  duration: row.duration ?? undefined,
  bvid: row.bvid ?? undefined,
  aid: row.aid != null ? Number(row.aid) : undefined,
  play: row.play != null ? Number(row.play) : undefined,
  pubdate: row.pubdate != null ? Number(row.pubdate) : undefined,
  neteaseId: row.netease_id != null ? Number(row.netease_id) : undefined,
  tags: row.tags ?? undefined,
  removed: row.removed_at != null,
})

const rowToCourse = (row: Record<string, any>): CourseRow => ({
  id: String(row.id),
  title: row.title,
  date: row.date,
  count: Number(row.count ?? 0),
  played: Number(row.played ?? 0),
  unplayed: Number(row.unplayed ?? 0),
})

const cleanMusic = (
  body: Partial<MusicRow>,
): Omit<MusicRow, 'id'> | null => {
  const title = String(body.title ?? '').trim()
  if (!title) return null
  return {
    title,
    source: body.source || 'bilibili',
    artist: String(body.artist ?? '').trim(),
    album: String(body.album ?? '').trim(),
    cover: String(body.cover ?? '').trim(),
    up: body.up ? String(body.up) : undefined,
    duration: body.duration ? String(body.duration) : undefined,
    bvid: body.bvid ? String(body.bvid) : undefined,
    aid: body.aid != null ? Number(body.aid) : undefined,
    play: body.play != null ? Number(body.play) : undefined,
    pubdate: body.pubdate != null ? Number(body.pubdate) : undefined,
    neteaseId: body.neteaseId != null ? Number(body.neteaseId) : undefined,
    tags: body.tags ? String(body.tags) : undefined,
  }
}

/* ---------- 音乐 ---------- */

/** 查询音乐列表（新添加的在前；不含已移除的） */
export async function listMusics(): Promise<MusicRow[]> {
  if (!hasDb()) return memMusics.filter((m) => !m.removed)
  await ensureSchema()
  const rows = await getSql()`
    SELECT * FROM musics WHERE removed_at IS NULL ORDER BY created_at DESC, id DESC
  `
  return rows.map(rowToMusic)
}

export interface InsertResult {
  /** 0 成功；1 已存在（重复 bvid） */
  code: 0 | 1
  item: MusicRow
}

/** 新增音乐；bilibili 来源按 bvid 去重（已移除的同 bvid 曲目会被恢复） */
export async function insertMusic(
  body: Partial<MusicRow>,
): Promise<InsertResult | null> {
  const music = cleanMusic(body)
  if (!music) return null

  if (!hasDb()) {
    const existing = music.bvid
      ? memMusics.find((m) => m.bvid === music.bvid)
      : music.neteaseId != null
        ? memMusics.find((m) => m.neteaseId === music.neteaseId)
        : undefined
    if (existing) {
      if (existing.removed) {
        // 恢复已移除的同源音乐
        const restored = { ...existing, ...music, removed: false }
        memMusics = memMusics.map((m) => (m.id === existing.id ? restored : m))
        return { code: 0, item: restored }
      }
      return { code: 1, item: existing }
    }
    const item = { ...music, id: memNextId('music') }
    memMusics = [item, ...memMusics]
    return { code: 0, item }
  }

  await ensureSchema()
  const s = getSql()

  // Postgres 的 ON CONFLICT DO UPDATE 必须指定冲突目标，而我们有 bvid 与
  // netease_id 两个唯一键，故采用「先查后更新/插入」的写法
  const conditions: string[] = []
  const condParams: (string | number)[] = []
  if (music.bvid) {
    conditions.push(`bvid = $${condParams.length + 1}`)
    condParams.push(music.bvid)
  }
  if (music.neteaseId != null) {
    conditions.push(`netease_id = $${condParams.length + 1}`)
    condParams.push(music.neteaseId)
  }
  const where = conditions.length ? `(${conditions.join(' OR ')})` : ''

  if (where) {
    const found = await s.query<{ id: string; removed_at: string | null }>(
      `SELECT * FROM musics WHERE ${where} LIMIT 1`,
      condParams,
    )
    if (found.length) {
      const wasRemoved = found[0].removed_at != null
      const updated = await s.query(
        `UPDATE musics SET
           removed_at = NULL, title = $1, source = $2, artist = $3, album = $4,
           cover = $5, up = $6, duration = $7,
           bvid = COALESCE($8, bvid), aid = $9, play = $10, pubdate = $11,
           netease_id = COALESCE($12, netease_id),
           tags = COALESCE($13, tags)
         WHERE id = $14
         RETURNING *`,
        [
          music.title, music.source, music.artist, music.album, music.cover,
          music.up ?? null, music.duration ?? null, music.bvid ?? null,
          music.aid ?? null, music.play ?? null, music.pubdate ?? null,
          music.neteaseId ?? null, music.tags ?? null, found[0].id,
        ],
      )
      return { code: wasRemoved ? 0 : 1, item: rowToMusic(updated[0]) }
    }
  }

  const inserted = await s.query(
    `INSERT INTO musics (title, source, artist, album, cover, up, duration, bvid, aid, play, pubdate, netease_id, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      music.title, music.source, music.artist, music.album, music.cover,
      music.up ?? null, music.duration ?? null, music.bvid ?? null,
      music.aid ?? null, music.play ?? null, music.pubdate ?? null,
      music.neteaseId ?? null, music.tags ?? null,
    ],
  )
  if (inserted.length) return { code: 0, item: rowToMusic(inserted[0]) }

  // 并发插入兜底：重新查询已存在记录
  const again = where
    ? await s.query(`SELECT * FROM musics WHERE ${where} LIMIT 1`, condParams)
    : []
  if (again.length) return { code: 1, item: rowToMusic(again[0]) }
  return { code: 1, item: rowToMusic({ ...music, id: '0' }) }
}

/**
 * 从音乐列表移除音乐（软删除：标记 removed_at）
 * 引用它的课程自动重新分配补位（歌曲数量不变；仅替换未播放的引用）
 */
export async function deleteMusicById(id: string): Promise<boolean> {
  if (!hasDb()) {
    if (!memMusics.some((m) => m.id === id)) return false
    // 收集受影响课程（未播放引用）
    const affected = [
      ...new Set(
        memCourseMusics
          .filter((m) => m.musicId === id && !m.isPlayed)
          .map((m) => m.courseId),
      ),
    ]
    memMusics = memMusics.map((m) =>
      m.id === id ? { ...m, removed: true } : m,
    )
    // 替换未播放引用为新的随机歌曲
    for (const courseId of affected) {
      memCourseMusics = memCourseMusics.filter(
        (m) => !(m.courseId === courseId && m.musicId === id && !m.isPlayed),
      )
      const used = new Set(
        memCourseMusics
          .filter((m) => m.courseId === courseId)
          .map((m) => m.musicId),
      )
      const pool = memMusics.filter((m) => !m.removed && !used.has(m.id))
      const picked = pickRandom(pool, 1)[0]
      if (picked) {
        const position =
          Math.max(0, ...memCourseMusics.filter((m) => m.courseId === courseId).map((m) => m.position)) + 1
        memCourseMusics.push({
          id: memNextId('cm'),
          courseId,
          musicId: picked.id,
          position,
          isPlayed: false,
        })
      }
      // 校正统计：count 对齐实际分配数（补位失败时自动减少），未播放数不为负
      const cmCount = memCourseMusics.filter((m) => m.courseId === courseId).length
      memCourses = memCourses.map((c) =>
        c.id === courseId
          ? { ...c, count: cmCount, unplayed: Math.max(0, cmCount - c.played) }
          : c,
      )
    }
    return true
  }

  await ensureSchema()
  const s = getSql()
  await s`UPDATE musics SET removed_at = now() WHERE id = ${id}`
  // 幂等：不存在或已移除均视为成功
  await refillCoursesAfterRemove(s, id)
  return true
}

/** 为所有未播放引用被删歌曲的课程补位一首新歌（不影响统计，保持数量） */
async function refillCoursesAfterRemove(
  s: NeonQueryFunction,
  musicId: string,
) {
  const affected = await s`
    SELECT DISTINCT course_id FROM course_musics
    WHERE music_id = ${musicId} AND is_played = false
  `
  for (const row of affected) {
    const courseId = Number(row.course_id)
    await s.transaction([
      s`DELETE FROM course_musics
         WHERE course_id = ${courseId} AND music_id = ${musicId} AND is_played = false`,
      s`INSERT INTO course_musics (course_id, music_id, position)
         SELECT ${courseId}, id,
                COALESCE((SELECT max(position) + 1 FROM course_musics cm WHERE cm.course_id = ${courseId}), 0)
         FROM musics
         WHERE removed_at IS NULL
           AND id NOT IN (SELECT music_id FROM course_musics cm WHERE cm.course_id = ${courseId})
         ORDER BY random()
         LIMIT 1`,
      // 校正统计：count 对齐实际分配数（曲库不足补位失败时自动减少），未播放数不为负
      s`UPDATE courses c SET
           count = (SELECT count(*) FROM course_musics cm WHERE cm.course_id = ${courseId}),
           unplayed = GREATEST(
             (SELECT count(*) FROM course_musics cm WHERE cm.course_id = ${courseId}) - c.played,
             0)
         WHERE c.id = ${courseId}`,
    ])
  }
}

/* ---------- 课程 ---------- */

/** 课程列表（新创建的在前） */
export async function listCourses(): Promise<CourseRow[]> {
  if (!hasDb()) return [...memCourses]
  await ensureSchema()
  const rows = await getSql()`
    SELECT * FROM courses ORDER BY created_at DESC, id DESC
  `
  return rows.map(rowToCourse)
}

export interface CourseInput {
  title: string
  date: string
  count: number
}

/** 创建课程并随机分配 count 首歌曲（曲库不足时取全部） */
export async function createCourse(input: CourseInput): Promise<CourseRow | null> {
  const title = String(input.title ?? '').trim() || null
  const date = String(input.date ?? '').trim() || null
  const count = Math.max(1, Math.min(30, Math.round(Number(input.count) || 1)))
  if (!title || !date) return null

  if (!hasDb()) {
    const id = memNextId('course')
    memCourses = [{ id, title, date, count: 0, played: 0, unplayed: 0 }, ...memCourses]
    const picked = pickRandom(memMusics.filter((m) => !m.removed), count)
    memCourseMusics = [
      ...memCourseMusics,
      ...picked.map((m, i) => ({
        id: memNextId('cm'),
        courseId: id,
        musicId: m.id,
        position: i,
        isPlayed: false,
      })),
    ]
    memCourses = memCourses.map((c) =>
      c.id === id ? { ...c, count: picked.length, unplayed: picked.length } : c,
    )
    return memCourses.find((c) => c.id === id)!
  }

  await ensureSchema()
  const s = getSql()
  const [row] = await s`INSERT INTO courses (title, date) VALUES (${title}, ${date}) RETURNING *`
  await assignRandomDb(s, Number(row.id), count)
  const [updated] = await s`SELECT * FROM courses WHERE id = ${row.id}`
  return rowToCourse(updated)
}

/** 重新配置课程（清空旧分配、重新随机） */
export async function reconfigureCourse(
  id: string,
  input: CourseInput,
): Promise<CourseRow | null> {
  const title = String(input.title ?? '').trim() || null
  const count = Math.max(1, Math.min(30, Math.round(Number(input.count) || 1)))
  if (!title) return null

  if (!hasDb()) {
    const course = memCourses.find((c) => c.id === id)
    if (!course) return null
    memCourseMusics = memCourseMusics.filter((m) => m.courseId !== id)
    const picked = pickRandom(memMusics.filter((m) => !m.removed), count)
    memCourseMusics = [
      ...memCourseMusics,
      ...picked.map((m, i) => ({
        id: memNextId('cm'),
        courseId: id,
        musicId: m.id,
        position: i,
        isPlayed: false,
      })),
    ]
    memCourses = memCourses.map((c) =>
      c.id === id
        ? { ...c, title, count: picked.length, played: 0, unplayed: picked.length }
        : c,
    )
    return memCourses.find((c) => c.id === id)!
  }

  await ensureSchema()
  const s = getSql()
  const [exists] = await s`SELECT id FROM courses WHERE id = ${id}`
  if (!exists) return null
  await assignRandomDb(s, Number(id), count, title)
  const [updated] = await s`SELECT * FROM courses WHERE id = ${id}`
  return rowToCourse(updated)
}

/** 删除课程（级联删除歌曲分配） */
export async function deleteCourseById(id: string): Promise<boolean> {
  if (!hasDb()) {
    const exists = memCourses.some((c) => c.id === id)
    if (!exists) return false
    memCourses = memCourses.filter((c) => c.id !== id)
    memCourseMusics = memCourseMusics.filter((m) => m.courseId !== id)
    return true
  }

  await ensureSchema()
  const s = getSql()
  const [deleted] = await s`DELETE FROM courses WHERE id = ${id} RETURNING id`
  return Boolean(deleted)
}

/** 课程的歌曲分配列表 */
export async function listCourseMusics(courseId: string): Promise<CourseSongRow[]> {
  if (!hasDb()) {
    const items = memCourseMusics
      .filter((m) => m.courseId === courseId)
      .sort((a, b) => a.position - b.position)
    return items
      .map((it) => {
        const music = memMusics.find((m) => m.id === it.musicId)
        return music
          ? { id: it.id, position: it.position, played: it.isPlayed, music }
          : null
      })
      .filter(Boolean) as CourseSongRow[]
  }

  await ensureSchema()
  const rows = await getSql()`
    SELECT cm.id AS cm_id, cm.position, cm.is_played,
           m.id AS music_id, m.title, m.source, m.artist, m.album, m.cover,
           m.up, m.duration, m.bvid, m.aid, m.play, m.pubdate, m.netease_id, m.tags
    FROM course_musics cm
    JOIN musics m ON m.id = cm.music_id
    WHERE cm.course_id = ${courseId}
    ORDER BY cm.position, cm.id
  `
  return rows.map((r: Record<string, any>) => ({
    id: String(r.cm_id),
    position: Number(r.position ?? 0),
    played: Boolean(r.is_played),
    music: rowToMusic({ ...r, id: r.music_id }),
  }))
}

/**
 * 播放完成上报：标记该曲目为已播放、课程已播放数 +1 / 未播放数 -1，
 * 并将歌曲从音乐列表移除（软删除）；课程音乐数量不变
 * 课程不存在时返回 false
 */
export async function completeCourseMusic(
  courseId: string,
  musicId: string,
): Promise<boolean> {
  if (!hasDb()) {
    const course = memCourses.find((c) => c.id === courseId)
    if (!course) return false
    const cm = memCourseMusics.find(
      (m) => m.courseId === courseId && m.musicId === musicId,
    )
    if (cm) cm.isPlayed = true
    memCourses = memCourses.map((c) =>
      c.id === courseId
        ? { ...c, played: c.played + 1, unplayed: Math.max(0, c.unplayed - 1) }
        : c,
    )
    memMusics = memMusics.map((m) =>
      m.id === musicId ? { ...m, removed: true } : m,
    )
    return true
  }

  await ensureSchema()
  const s = getSql()
  const [exists] = await s`SELECT id FROM courses WHERE id = ${courseId}`
  if (!exists) return false
  await s.transaction([
    s`UPDATE course_musics SET is_played = true
       WHERE course_id = ${courseId} AND music_id = ${musicId}`,
    s`UPDATE courses SET
         played = played + 1,
         unplayed = GREATEST(unplayed - 1, 0)
       WHERE id = ${courseId}`,
    s`UPDATE musics SET removed_at = now() WHERE id = ${musicId}`,
  ])
  return true
}

/* ---------- 通用配置（key-value，用于持久化网易云登录 cookie 等） ---------- */

const memSettings = new Map<string, string>()

/** 读取配置项 */
export async function getSetting(key: string): Promise<string | null> {
  if (!hasDb()) return memSettings.get(key) ?? null
  await ensureSchema()
  const rows = await getSql()`SELECT value FROM app_settings WHERE key = ${key} LIMIT 1`
  return rows.length ? String(rows[0].value) : null
}

/** 写入配置项（不存在则插入） */
export async function setSetting(key: string, value: string): Promise<void> {
  if (!hasDb()) {
    memSettings.set(key, value)
    return
  }
  await ensureSchema()
  await getSql()`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `
}

/** 删除配置项 */
export async function deleteSetting(key: string): Promise<void> {
  if (!hasDb()) {
    memSettings.delete(key)
    return
  }
  await ensureSchema()
  await getSql()`DELETE FROM app_settings WHERE key = ${key}`
}

/** 按 bvid 回写视频标签（仅在原标签为空时写入，用于历史数据补全） */
export async function updateMusicTagsByBvid(
  bvid: string,
  tags: string,
): Promise<void> {
  if (!bvid || !tags) return
  if (!hasDb()) {
    memMusics = memMusics.map((m) =>
      m.bvid === bvid && !m.tags ? { ...m, tags } : m,
    )
    return
  }
  await ensureSchema()
  await getSql()`
    UPDATE musics SET tags = ${tags}
    WHERE bvid = ${bvid} AND (tags IS NULL OR tags = '')
  `
}
