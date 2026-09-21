// 临时验证脚本：用 PGlite（WASM Postgres）跑通全部数据库 SQL 路径
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const src = readFileSync('server/utils/db.ts', 'utf8')

// 1. 抽取 DDL 语句（数组内所有反引号字符串）
const block = src.match(/const DDL_STATEMENTS = \[([\s\S]*?)\n\]/)
if (!block) throw new Error('未找到 DDL_STATEMENTS')
const ddl = [...block[1].matchAll(/`([\s\S]*?)`/g)].map((m) => m[1].trim())

const db = new PGlite()
console.log(`== 1. DDL（${ddl.length} 条）==`)
let ddlFail = 0
for (const stmt of ddl) {
  try {
    await db.exec(stmt)
    console.log('  ✓', stmt.split('\n')[0].slice(0, 60))
  } catch (err) {
    ddlFail++
    console.log('  ✗', stmt.split('\n')[0].slice(0, 60), '->', err.message)
  }
}

const run = async (label, sql, params = []) => {
  try {
    const r = await db.query(sql, params)
    console.log('  ✓', label, '| rows:', r.rows.length)
    return r.rows
  } catch (err) {
    console.log('  ✗', label, '->', err.message)
    return []
  }
}

console.log('== 2. 音乐：新的 upsert 路径 ==')
const insertMusic = async (music, label) => {
  const conditions = []
  const condParams = []
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
    const found = await run(`${label} · 查重`, `SELECT * FROM musics WHERE ${where} LIMIT 1`, condParams)
    if (found.length) {
      const updated = await run(
        `${label} · 更新/恢复`,
        `UPDATE musics SET removed_at = NULL, title = $1, source = $2, artist = $3, album = $4,
           cover = $5, up = $6, duration = $7, bvid = COALESCE($8, bvid), aid = $9,
           play = $10, pubdate = $11, netease_id = COALESCE($12, netease_id)
         WHERE id = $13 RETURNING *`,
        [music.title, music.source, music.artist ?? '', music.album ?? '', music.cover ?? '',
         music.up ?? null, music.duration ?? null, music.bvid ?? null, music.aid ?? null,
         music.play ?? null, music.pubdate ?? null, music.neteaseId ?? null, found[0].id],
      )
      return updated
    }
  }
  const inserted = await run(
    `${label} · 插入`,
    `INSERT INTO musics (title, source, artist, album, cover, up, duration, bvid, aid, play, pubdate, netease_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT DO NOTHING RETURNING *`,
    [music.title, music.source, music.artist ?? '', music.album ?? '', music.cover ?? '',
     music.up ?? null, music.duration ?? null, music.bvid ?? null, music.aid ?? null,
     music.play ?? null, music.pubdate ?? null, music.neteaseId ?? null],
  )
  if (!inserted.length && where) {
    await run(`${label} · 并发兜底重查`, `SELECT * FROM musics WHERE ${where} LIMIT 1`, condParams)
  }
  return inserted
}

const mv = await insertMusic(
  { title: '稻香', source: 'bilibili', artist: '周杰伦', album: '魔杰座', cover: 'c.jpg', bvid: 'BV1xx' },
  'MV 新增',
)
await insertMusic(
  { title: '稻香（重复添加）', source: 'bilibili', artist: '周杰伦', bvid: 'BV1xx' },
  'MV 重复',
)
const ne = await insertMusic(
  { title: '起风了', source: 'netease', artist: '买辣椒也用券', album: '起风了', neteaseId: 1330348068 },
  '网易云新增',
)
await insertMusic({ title: '起风了（重复）', source: 'netease', neteaseId: 1330348068 }, '网易云重复')
await insertMusic({ title: '本地曲目', source: 'local', artist: '某老师' }, '本地新增（无唯一键）')
await run('软删除', `UPDATE musics SET removed_at = now() WHERE id = $1`, [ne[0]?.id ?? 3])
await insertMusic({ title: '起风了（恢复）', source: 'netease', neteaseId: 1330348068 }, '网易云恢复')
await run('listMusics', `SELECT * FROM musics WHERE removed_at IS NULL ORDER BY created_at DESC, id DESC`)

console.log('== 3. 课程 ==')
const c1 = await run(
  'INSERT courses',
  `INSERT INTO courses (title, date) VALUES ($1,$2) RETURNING *`,
  ['2025年9月21日课程', '2025-09-21'],
)
const cid = c1[0]?.id
const assigned = await run(
  '随机分配',
  `INSERT INTO course_musics (course_id, music_id)
   SELECT $1, id FROM musics WHERE removed_at IS NULL ORDER BY random() LIMIT $2 RETURNING *`,
  [cid, 2],
)
await run(
  '课程统计更新',
  `UPDATE courses c SET
     count = (SELECT count(*) FROM course_musics cm WHERE cm.course_id = $1),
     played = 0,
     unplayed = (SELECT count(*) FROM course_musics cm WHERE cm.course_id = $1)
   WHERE c.id = $1`,
  [cid],
)
await run('listCourses', `SELECT * FROM courses ORDER BY created_at DESC, id DESC`)
await run(
  'listCourseMusics（JOIN）',
  `SELECT cm.id AS cm_id, cm.position, cm.is_played, m.id AS music_id, m.title, m.source,
          m.artist, m.album, m.cover, m.up, m.duration, m.bvid, m.aid, m.play, m.pubdate
   FROM course_musics cm JOIN musics m ON m.id = cm.music_id
   WHERE cm.course_id = $1 ORDER BY cm.position, cm.id`,
  [cid],
)
const targetMusicId = assigned[0]?.music_id
await run(
  '补位：删除未播放引用',
  `DELETE FROM course_musics WHERE course_id = $1 AND music_id = $2 AND is_played = false`,
  [cid, targetMusicId],
)
await run(
  '补位：随机插入替代曲目',
  `INSERT INTO course_musics (course_id, music_id, position)
   SELECT $1, id, COALESCE((SELECT max(position) + 1 FROM course_musics cm WHERE cm.course_id = $1), 0)
   FROM musics
   WHERE removed_at IS NULL AND id NOT IN (SELECT music_id FROM course_musics cm WHERE cm.course_id = $1)
   ORDER BY random() LIMIT 1`,
  [cid],
)
await run(
  '补位后统计校正',
  `UPDATE courses c SET
     count = (SELECT count(*) FROM course_musics cm WHERE cm.course_id = $1),
     unplayed = GREATEST((SELECT count(*) FROM course_musics cm WHERE cm.course_id = $1) - c.played, 0)
   WHERE c.id = $1`,
  [cid],
)
await run('播放完成标记', `UPDATE course_musics SET is_played = true WHERE course_id = $1 AND music_id = $2`, [cid, targetMusicId])
await run('进度 +1', `UPDATE courses SET played = played + 1, unplayed = GREATEST(unplayed - 1, 0) WHERE id = $1`, [cid])
const stat = await run('查看统计', `SELECT count, played, unplayed FROM courses WHERE id = $1`, [cid])
console.log('     →', JSON.stringify(stat[0]))
await run('删除课程', `DELETE FROM courses WHERE id = $1 RETURNING id`, [cid])
const left = await run('级联检查', `SELECT count(*)::int AS n FROM course_musics`)
console.log('     course_musics 剩余:', left[0]?.n)

console.log('== 4. 配置表 ==')
await run(
  'setSetting',
  `INSERT INTO app_settings (key, value, updated_at) VALUES ($1,$2, now())
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
  ['netease_cookie', 'MUSIC_U=test'],
)
await run('getSetting', `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`, ['netease_cookie'])
await run('deleteSetting', `DELETE FROM app_settings WHERE key = $1`, ['netease_cookie'])

console.log('== 5. 事务 ==')
try {
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO app_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ['t', '1'],
    )
    await tx.query(`UPDATE app_settings SET value = $1 WHERE key = $2`, ['2', 't'])
    await tx.query(`DELETE FROM app_settings WHERE key = $1`, ['t'])
  })
  console.log('  ✓ 事务提交成功（多语句原子执行）')
} catch (err) {
  console.log('  ✗ 事务失败 ->', err.message)
}

await db.close()
console.log(`\n验证完成（DDL 失败 ${ddlFail} 条）`)
