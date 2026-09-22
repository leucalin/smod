# 祁阳一中音乐课歌曲智能点播系统

面向中学音乐课堂的点歌与播放系统：老师在曲库中挑选歌曲、按课时随机分配歌单，课上在大屏（学校一体机）上播放。支持 **bilibili MV** 与 **网易云音乐** 两种音源，MV 播放视频、歌曲以 Apple Music 风格展示封面与滚动词屏歌词。

## 功能特性

### 音乐列表
- 在「添加音乐」卡片中切换音源搜索：**bilibili**（展示视频封面、UP 主、时长）与 **网易云音乐**（展示专辑封面、歌手、专辑、时长）
- 搜索结果分页（上一页 / 下一页），一键添加到曲库
- 曲库卡片：MV 为竖版视频封面卡片，歌曲为横版卡片（左侧正方形专辑封面）
- 卡片删除按钮常显；删除后引用该歌曲的课程自动补位新歌，课程数量保持不变

### 课程列表
- 右上角「添加课程」：课程标题默认「x年x月x日课程」，拖动条配置播放音乐数（1–30 首）
- 确定后由**服务端随机分配**歌曲，并提示「正在随机分配歌曲」
- 课程卡片展示标题、日期、音乐数量、已播放数、未播放数
- 「课程歌曲列表」弹窗查看该课程分配的全部歌曲及播放状态
- 「重新配置」重新随机分配，「课程开始」进入播放页，「删除」移除课程

### 播放页面
- **bilibili MV**：服务端代理取流（WBI 签名 + 会话维护），视频区域铺满屏幕，界面仅保留开始 / 暂停与切换歌曲；点击视频即可暂停、再次点击继续
- **网易云音乐**：Apple Music 风格界面——封面色彩模糊背景、左侧大封面与歌曲信息、进度条与时间、右侧滚动词屏歌词（当前行高亮、自动居中），按键仅保留切换歌曲与开始暂停
- 两种界面之间为方向感知的交叉过渡（背景渐显、元素分层浮现）
- 当前歌曲播放结束自动连播下一首；临近结束弹出提示；最后一首播完提示课程结束
- 播放过的歌曲自动标记为已播放并从音乐列表移除（课程统计同步更新）
- 无法播放的歌曲自动跳过，且不计为已播放

### 网易云登录（VIP 歌曲）
- 扫码登录页 `/netease-login`（不在侧栏展示，直接访问）
- 登录后播放网易云歌曲默认请求**无损音质**（按账号权益自动降级）
- 播放会员尊享音质歌曲时，页面顶部弹出提示横幅

## 技术栈

| 层面 | 选型 |
| --- | --- |
| 框架 | Nuxt 4（Vue 3 + Nitro Server Engine） |
| 数据库 | Neon Postgres（`@neondatabase/serverless`，未配置时为内存模式） |
| 网易云音源 | `@neteasecloudmusicapienhanced/api`（进程内直接调用，无需单独部署） |
| bilibili 音源 | 官方 Web API（搜索 / 取流，服务端 WBI 签名与会话维护） |
| 样式 | 原生 CSS 设计系统（Apple 风格：半透明材质、弹簧缓动、可达性适配） |

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（至少填写 DATABASE_URL，否则使用内存演示数据）
cp .env.example .env

# 启动开发服务器
npm run dev          # http://localhost:3000
```

生产构建与运行：

```bash
npm run build
node .output/server/index.mjs
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 建议 | Neon Postgres 连接串。未配置时使用内存数据（重启即丢失，仅本地调试） |
| `NETEASE_API_BASE` | 可选 | 改用独立部署的 NeteaseCloudMusicApiEnhanced 服务时填写 |
| `NETEASE_REAL_IP` | 可选 | 服务端网易云请求携带的出口 IP 标识（`X-Real-IP`）。部署在海外节点（如 Vercel）时建议配置一个国内 IP，规避海外 IP 的播放限制与风控 |

## 目录结构

```
app/
  pages/          # music（音乐列表）/ courses（课程列表）/ play（播放页）/ netease-login（扫码登录）
  components/     # AddMusicCard、MusicCard、CourseCard、CourseDialog、CourseSongsDialog、ConfirmDialog、MediaCover、ToastStack
  composables/    # useMusicStore（数据与接口）、useToast（提示）
  assets/css/     # 设计系统（main.css）
server/
  api/            # bilibili（search / playurl / stream）、netease（search / song / lyric / login / logout）、musics、courses
  utils/          # bilibili.ts（WBI 签名与取流）、netease.ts（网易云模块与登录态）、db.ts（数据访问）
```

## 接口一览

| 接口 | 说明 |
| --- | --- |
| `GET /api/bilibili/search` | bilibili 视频搜索（分页） |
| `GET /api/bilibili/playurl` | 获取 MV 播放地址 |
| `GET /api/bilibili/stream` | MV 视频流代理（支持 Range） |
| `GET /api/netease/search` | 网易云歌曲搜索（分页） |
| `GET /api/netease/song` | 网易云播放直链（含音质信息） |
| `GET /api/netease/lyric` | 歌词（解析为时间轴数组） |
| `GET /api/netease/login/qr` | 生成扫码登录二维码 |
| `GET /api/netease/login/check` | 轮询扫码状态 |
| `GET /api/netease/login/status` | 查询登录状态与账号信息 |
| `POST /api/netease/logout` | 退出登录 |
| `GET / POST /api/musics`、`DELETE /api/musics/:id` | 曲库增查删 |
| `GET / POST /api/courses`、`PUT / DELETE /api/courses/:id` | 课程增查改删 |
| `GET /api/courses/:id/musics` | 课程歌曲列表 |
| `POST /api/courses/:id/played` | 播放完成上报 |

## 数据库

首次访问时自动建表（幂等），共四张表：

| 表 | 用途 |
| --- | --- |
| `musics` | 曲库（含来源、bvid / netease_id、软删除标记） |
| `courses` | 课程（标题、日期、数量、已播放、未播放） |
| `course_musics` | 课程歌曲分配（含已播放标记） |
| `app_settings` | 通用配置（持久化网易云登录 cookie） |

改动 SQL 后可在本地验证全部语句（用 WASM 版 Postgres 执行，无需真实数据库）：

```bash
npm run verify:sql
```

## 部署说明

- **Vercel + Neon**：将仓库导入 Vercel，配置环境变量 `DATABASE_URL` 即可构建部署（Nitro 自动产出 Serverless Functions）
- **网易云登录态**：登录 cookie 保存在**服务端**（`app_settings` 表），因此在家扫码登录后，到学校打开同一站点仍是登录状态，一体机无需重复登录。请勿将站点公开到公网——服务端保存的是账号凭据，任何能访问站点的人都会使用该账号播放
- **出口 IP**：网易云的登录与全部账号级请求都在服务端发起（浏览器只负责显示二维码与拉取音频流），不存在前后端 IP 不一致问题；部署在海外节点时建议固定函数区域并配置 `NETEASE_REAL_IP`
- **bilibili 取流**：经由服务端代理转发，需保证运行环境可访问 bilibili
