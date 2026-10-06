# 初一把

匿名游玩的 Vocaloid 猜歌小游戏。首页、每日挑战、单人模式和多人联机；设置与反馈为弹窗。

此仓库是 Cloudflare 免费测试版，正式 Worker 名称为 `mikumiku-guess`。

独立域名：https://mikumiku-guess.online/

备用测试网址：https://mikumiku-guess.wzyoung27.workers.dev/

## 托管

- 页面、曲库和播放量记录使用 Workers Static Assets，曲库和 Top100 在构建时生成。
- Workers 只处理播放量记录读取、官方封面代理和反馈提交，猜测不会访问 Google/Nico API。
- D1 的 `DB` 绑定保存玩家反馈，无公开反馈读取接口。
- 封面使用 Cloudflare 免费 Cache API 缓存，无需开通 R2 或 Workers 付费套餐。
- SQLite Durable Objects 保存每日题目、服务器猜测记录和联机房间；联机使用可休眠的 WebSocket 推送。
- D1 的 `daily_scores` 保存玩家主动提交的每日成绩；公开接口仅返回昵称、次数和排名，不返回浏览器标识。
- `FEEDBACK_SIGNING_KEY` 只保存为 Cloudflare Worker secret，不进入仓库。

## 本地运行

使用 Node.js 24、pnpm 11。首次运行 `pnpm install`。

```
pnpm build
pnpm test
pnpm test:cloudflare
pnpm test:games
pnpm exec wrangler d1 migrations apply mikumiku-guess-feedback --local
pnpm dev
```

在本地 `.dev.vars` 中设置 `FEEDBACK_SIGNING_KEY`，该文件被 Git 忽略。
本地服务器运行后，可执行 `pnpm test:local` 验证真实 Workers、D1 与双人 WebSocket；默认测试地址是 `http://127.0.0.1:5174`，可通过 `LOCAL_GAME_URL` 指定本机端口。该测试拒绝连接公网域名。

## 游戏规则与难度

- 每日挑战按北京时间每日更新，固定传说曲曲库及完整年份。题目和播放量版本由服务器保存，所有玩家相同；不接收玩家自行填写的成绩。猜中后可提交公开昵称，每个浏览器每天保留一次成绩，次数相同并列。匿名浏览器身份无法阻止清除 Cookie 或使用另一浏览器参赛。
- 默认普通 200 首；简单 50 首、困难 500 首逐级包含。选择自定义后才展开曲库、年份条件；此设置只影响单人模式与新房间。
- `data/difficulties.json` 是固定、可人工审核的选曲及依据，包含经典／中期／近年名额、每个平台播放量与榜单分数。每周更新播放量不会换曲；维护者可人工复核后运行 `pnpm difficulty:update` 更新曲单。
- 经典对决固定 2 人，各 10 次；双方结束后比较成功猜测次数，次数少者赢、同次数或都失败算平局。BO1／BO3／BO5 先赢 1／2／3 局；平局不计胜局。
- 合作接力 2—8 人，轮流猜同一首、共用 10 次。猜中者得 1 分，耗尽无人得分；BO1／BO3／BO5 共 1／3／5 轮，按积分排名；每轮轮换起始玩家。
- 6 位房间码用于邀请；只有房主可设置人数、模式、局制与曲库。全部准备后开始。对局中断线保留席位，使用同一浏览器重连；房主可以结束中断的对局并重开。等待页房主离开后身份顺延。房间无操作 24 小时后过期。
- 首页链接作者 Bilibili；私有 GitHub 仓库暂不展示。

## 部署与维护

Cloudflare Builds 连接本仓库，正式分支为 `main`。构建命令为 `pnpm build`，部署命令为 `pnpm exec wrangler deploy`。Cloudflare Worker 名称应与 `wrangler.jsonc` 保持一致。

独立域名在 Cloudflare Worker 的 Domains 中绑定，两个网址使用同一份游戏和数据。现有部署配置保留控制台中的域名绑定，代码更新和每周播放量更新会同时发布到两个网址。

数据库首次部署前执行：

```
pnpm exec wrangler d1 migrations apply mikumiku-guess-feedback --remote
```

更新曲库和界面时先通过测试，再提交到正式分支。已发布的曲目 ID 应保持稳定。
新增排行榜版本部署前先应用 D1 迁移 `0001_daily_scores.sql`，再发布 Worker；Durable Object 的 `game-v1` 迁移会随发布创建 SQLite 类。正式域名和原有密钥沿用既有配置，不需要付费服务。

## 每周播放量更新

GitHub Actions 计划在北京时间每周一 07:00 启动，GitHub 排队可能延迟实际执行时间。也可在 Actions 中手动运行 Weekly playback update。

在 GitHub Settings → Secrets and variables → Actions 中配置：

- `YOUTUBE_API_KEY`：具有 YouTube Data API v3 访问权限的有效密钥。

更新任务只查询已核实的官方视频 ID。Nico 每批最多 100 个，YouTube 每批最多 50 个；Nico 查询前后版本须一致。任一平台失败或记录异常减少则不替换旧快照。成功后保存整套快照及归档，检查通过后提交到 main，由 Cloudflare 官方 GitHub 集成发布。无需额外的部署 Hook 或保存在 GitHub 的 Cloudflare API token。

每局固定一个快照版本。归档在构建时按歌曲整理，旧快照与最新记录共用同一组文件，不会每周增加数千个静态文件。
首次更新前开始的对局也保留原有快照，下一局使用最新数据。

## 反馈与隐私

玩家评分和建议只保存在 D1，维护者在 Cloudflare 数据库控制台查看。`is_test=1` 为维护测试，应从评分统计中排除。数据库导出、账号密钥和玩家反馈不能提交到 GitHub。

旧站与新域名的浏览器本地进度彼此独立；此项目不需要玩家注册登录。
