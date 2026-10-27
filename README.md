# VexHotList

V2EX「最热」的每日存档，给 [Vex](https://apps.apple.com/app/id6760471743) 的「最热」页里「昨天、前天、3 天、7 天」用。

## 地址

```
https://hot.ryusaksun.com/<年>-<月>-<日>.json
```

例如 `2026-10-26.json`。月、日不补零。没有这一天时回 404。

## 怎么来的

- GitHub Actions 每小时跑一次（`.github/workflows/collect.yml`，由 Cloudflare Worker 准点叫起来，见下面「定时」），匿名打开 `https://www.v2ex.com/?tab=hot`（电脑版页面）。
- 把这一次看到的主题并进当天的文件：
  - 同一主题的回复数取大的。
  - 掉出「最热」的主题照样留着。
- 提交后发布到 GitHub Pages，站点绑在 `hot.ryusaksun.com` 上（Cloudflare DNS 里一条 CNAME 指向 `ryusaksun.github.io`，不走代理）。

「一天」按 UTC 日算，也就是北京时间早上 8 点到第二天早上 8 点，和网站「最热」的切日一致。UTC 零点后 15 分钟内不记：这时候网站刚换到新的一天，列表几乎是空的。

## 定时

GitHub 自己的定时任务常常推迟几个小时，甚至整段不跑（上线头一天 20 小时只跑了 3 次）。所以由 Cloudflare 上的一个 Worker（`trigger/`）每小时第 17 分钟准点调 GitHub 的「手动运行」接口（workflow_dispatch），跑一次 collect.yml。collect.yml 里 GitHub 自己的定时留着兜底：Worker 出了问题，存档只是变稀，不会断。

Worker 只做这一件事：没有网址，只靠定时运行，也不访问 V2EX。抓取不能放进 Worker：V2EX 对部署后的 Worker 发出的请求一律回 403（2026-10-27 实测；`wrangler dev --remote` 的预览能拿到 200，不算数）。

设置一次：

1. 在 GitHub 建一个细粒度令牌：打开[预填好的页面](https://github.com/settings/personal-access-tokens/new?name=VexHotList%20%E5%AE%9A%E6%97%B6%E8%A7%A6%E5%8F%91&description=Cloudflare%20Worker%EF%BC%88vexhotlist-trigger%EF%BC%89%E6%AF%8F%E5%B0%8F%E6%97%B6%E8%B0%83%20workflow_dispatch%20%E8%B7%91%20collect.yml&target_name=ryusaksun&expires_in=none&actions=write)，「Repository access」选「Only select repositories」里的 VexHotList。权限只有 Actions 读写（另带必需的 Metadata 只读），只能触发、取消这个仓库的工作流，改不了代码和数据。
2. 在 `trigger/` 目录部署、填令牌：

   ```sh
   npx wrangler deploy
   npx wrangler secret put GITHUB_TOKEN   # 粘贴令牌
   ```

3. 下一个整点 17 分以后，`gh run list --workflow collect.yml` 里应该出现触发方式为 `workflow_dispatch` 的运行；Cloudflare 控制台里这个 Worker 的日志写着「已叫 GitHub 跑一次「抓取最热」」。

令牌被撤销或过期时，Worker 每次都报 HTTP 401（日志里看得到），存档退回只靠 GitHub 自己的定时。换令牌：再运行一次第 2 步的 `secret put`。

## 文件格式

数组，按回复数从多到少排；一样多时，新帖排在前面。每一项：

| 字段 | 说明 |
|---|---|
| `id` | 主题 ID |
| `title` | 标题 |
| `replyCount` | 回复数，停在最后一次在「最热」上看到的那一刻 |
| `avatar` | 作者头像地址 |
| `username` | 作者 |
| `lastReplyUsername` | 最后回复的人（没人回复时没有） |
| `lastReplyDate` | 最后回复时间，北京时间，`2026-10-26 16:18:23` |
| `nodeTitle`、`nodeUrl` | 节点名与节点地址里的名字（`/go/<nodeUrl>`） |

字段与 [V2Next](https://github.com/zyronon/V2Next) 的存档相同。

## 本地运行

不依赖第三方包，要 Node 22。

```sh
node --test collector/test/*.test.mjs trigger/test/*.test.mjs  # 测试
HOT_OUT_DIR=/tmp/hot node collector/collect.mjs                 # 抓一次，写到 /tmp/hot
```
