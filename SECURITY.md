# 安全与私人数据

如发现会暴露身份、玩家数据或密钥的问题，请通过游戏中的意见反馈联系维护者，并说明复现步骤；不要在公开Issue贴出密钥或玩家私人数据。

YouTube密钥放在GitHub Actions Secrets，网站签名密钥放在Cloudflare Worker Secrets。本机开发使用被Git忽略的`.dev.vars`。项目源码及曲库资料公开，玩家反馈保存在D1中，不提供公开读取接口。

`scripts/audit-public-history.py` 检查当前源码、所有可达Git提交及历史发布压缩包中的常见密钥形式和私人文件；结果只输出文件位置和类型。此检查辅助代码审核，不能替代对新增外部数据的人工判断。
