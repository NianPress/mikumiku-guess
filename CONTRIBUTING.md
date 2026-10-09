# 参与项目

感谢帮助完善初一把。项目维护者负责审核并发布正式版本。

## 修改与验证

1. 从最新 `main` 创建修改分支；使用 Node.js 24 和仓库指定的 pnpm 版本。
2. 首次运行 `pnpm install`，配置本机 `.dev.vars` 后运行 `pnpm dev`。多人测试使用不同浏览器或独立配置。
3. 修改后运行 `pnpm test`、`pnpm build`、`pnpm test:cloudflare`、`pnpm test:games`、`pnpm test:undercover`、`pnpm test:release`。
4. 涉及房间同步、投票或计时的修改，另外运行 `pnpm test:local` 或 `pnpm test:undercover:local`，连接本机测试服务器。
5. 提交 Pull Request，说明玩家能看到的变化及验证结果；维护者确认后合并。

## 数据修订

曲名、别名、P主、歌姬、投稿链接或榜单信息需要给出来源。优先官方投稿，其次可靠百科和已核对榜单。保持现有曲目ID稳定，不以歌名代替唯一ID。播放量使用每周快照，官方投稿缺失与零播放量应分开处理。

## 功能更新与公告

`dist/updates.json` 是公告来源。新增一条版本记录，包含版本号、北京时间日期、标题及面向玩家的变化，再运行 `pnpm release:notes` 生成 `CHANGELOG.md`。

每次功能更新同时提交代码和公告到 GitHub，通过验证后再合并 `main`。Cloudflare 从同一提交构建网站；公告任务确认正式网站版本号一致后，创建或更新对应的 GitHub Release。部署失败时不会提前发布公告。每周播放量快照由既有任务保存到同一仓库，不单独提升功能版本。

密钥、数据库文件、玩家反馈及本机配置不进入提交。`package.json` 的 `private: true` 用于防止误发到 npm，与 GitHub 仓库可见性无关。
