# 初一把

匿名游玩的 Vocaloid 猜歌小游戏。首页、每日挑战和单人模式；设置与反馈为弹窗。

此仓库是 Cloudflare 免费测试版，正式 Worker 名称为 `mikumiku-guess`。

## 托管

- 页面、曲库和播放量记录使用 Workers Static Assets，曲库和 Top100 在构建时生成。
- Workers 只处理播放量记录读取、官方封面代理和反馈提交，猜测不会访问 Google/Nico API。
- D1 的 `DB` 绑定保存玩家反馈，无公开反馈读取接口。
- 封面使用 Cloudflare 免费 Cache API 缓存，无需开通 R2 或 Workers 付费套餐。
- `FEEDBACK_SIGNING_KEY` 只保存为 Cloudflare Worker secret，不进入仓库。

## 本地运行

使用 Node.js 24、pnpm 11。首次运行 `pnpm install`。

```
pnpm build
pnpm test
pnpm test:cloudflare
pnpm dev
```

在本地 `.dev.vars` 中设置 `FEEDBACK_SIGNING_KEY`，该文件被 Git 忽略。

## 部署与维护

Cloudflare Builds 连接本仓库，正式分支为 `main`。构建命令为 `pnpm build`，部署命令为 `pnpm exec wrangler deploy`。Cloudflare Worker 名称应与 `wrangler.jsonc` 保持一致。

数据库首次部署前执行：

```
pnpm exec wrangler d1 migrations apply mikumiku-guess-feedback --remote
```

更新曲库和界面时先通过测试，再提交到正式分支。已发布的曲目 ID 应保持稳定。

## 每周播放量更新

GitHub Actions 计划在北京时间每周一 07:00 启动，GitHub 排队可能延迟实际执行时间。也可在 Actions 中手动运行 Weekly playback update。

在 GitHub Settings → Secrets and variables → Actions 中配置：

- `YOUTUBE_API_KEY`：具有 YouTube Data API v3 访问权限的有效密钥。
- `CLOUDFLARE_DEPLOY_HOOK`：仅用于本 Worker 正式分支的 Cloudflare Deploy Hook。

更新任务只查询已核实的官方视频 ID。Nico 每批最多 100 个，YouTube 每批最多 50 个；Nico 查询前后版本须一致。任一平台失败或记录异常减少则不替换旧快照。成功后保存整套快照及归档，构建并触发 Cloudflare 发布。

每局固定一个快照版本。归档在构建时按歌曲整理，旧快照与最新记录共用同一组文件，不会每周增加数千个静态文件。

## 反馈与隐私

玩家评分和建议只保存在 D1，维护者在 Cloudflare 数据库控制台查看。`is_test=1` 为维护测试，应从评分统计中排除。数据库导出、账号密钥和玩家反馈不能提交到 GitHub。

旧站与新域名的浏览器本地进度彼此独立；此项目不需要玩家注册登录。
