# VexHotList

V2EX「最热」的每日存档，给 [Vex](https://apps.apple.com/app/id6760471743) 的「最热」页里「昨天、前天、3 天、7 天」用。

## 地址

```
https://ryusaksun.github.io/VexHotList/hot/<年>-<月>-<日>.json
```

例如 `hot/2026-10-26.json`。月、日不补零。

## 怎么来的

- GitHub Actions 每小时跑一次（`.github/workflows/collect.yml`），匿名打开 `https://www.v2ex.com/?tab=hot`（电脑版页面）。
- 把这一次看到的主题并进当天的文件：
  - 同一主题的回复数取大的。
  - 掉出「最热」的主题照样留着。
- 提交后发布到 GitHub Pages。

「一天」按 UTC 日算，也就是北京时间早上 8 点到第二天早上 8 点，和网站「最热」的切日一致。UTC 零点后 15 分钟内不记：这时候网站刚换到新的一天，列表几乎是空的。

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
node --test collector/test/*.test.mjs        # 测试
HOT_OUT_DIR=/tmp/hot node collector/collect.mjs  # 抓一次，写到 /tmp/hot
```
