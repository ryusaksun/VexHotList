// 挑哪些主题去核对回复数、核对结果怎么写回。

import { addDays } from './lists.mjs'
import { formatBeijingTime, normalize } from './lib.mjs'

/** 回复数到这么多才核对：长榜第 100 名都在 90 以上，真实值最多是存档的 2.9 倍（10-31 抽样）。 */
export const MIN_REPLIES = 30
/** 发帖后这么多天内每天核对一次，之后回复基本停了，再核对一次就不用管了。 */
export const SETTLE_DAYS = 14
const dayInSeconds = 86_400

/**
 * 这一条要不要核对。没核对过的要；核对时还没满 `SETTLE_DAYS` 天的，隔一天再核对一次。
 * `day` 是它所在存档的那一天。
 */
export function needsRefresh(topic, day, now) {
  if (topic.replyCount < MIN_REPLIES) return false
  if (topic.checkedAt === undefined) return true
  const settledAt = addDays(day, SETTLE_DAYS) / 1000
  return topic.checkedAt < settledAt && now / 1000 - topic.checkedAt >= dayInSeconds
}

/**
 * 这一次核对哪些，最多 `limit` 条：今年的存档里，没核对过的排前面，回复多的先来（榜单靠前的先准）；其余的按上次核对的先后。
 * 今天的不核对：还在涨，抓取每小时都在更新。
 */
export function selectForRefresh(days, today, now, limit) {
  const firstDay = Date.UTC(new Date(today).getUTCFullYear(), 0, 1)
  const picks = []
  for (const entry of days) {
    if (entry.day < firstDay || entry.day >= today) continue
    for (const topic of entry.topics) {
      if (needsRefresh(topic, entry.day, now)) picks.push({ entry, topic })
    }
  }
  picks.sort((a, b) => {
    const neverA = a.topic.checkedAt === undefined
    const neverB = b.topic.checkedAt === undefined
    if (neverA !== neverB) return neverA ? -1 : 1
    if (neverA) return b.topic.replyCount - a.topic.replyCount
    return a.topic.checkedAt - b.topic.checkedAt
  })
  return picks.slice(0, Math.max(limit, 0))
}

/**
 * 接口的结果写回这一条。`info` 为空（主题被删，或匿名看不到）时只记下核对过，别的不动：分不清是哪种，榜单上留着。
 * 回复数只升不降：帖子里的回复被删时接口的数字会变小，取大的与抓取时同一口径。节点、标题用接口的：管理员可能挪过节点。
 */
export function applyTopicInfo(topic, info, now) {
  const checkedAt = Math.floor(now / 1000)
  if (!info) return normalize({ ...topic, checkedAt })
  return normalize({
    ...topic,
    title: info.title || topic.title,
    replyCount: Math.max(topic.replyCount, info.replies ?? 0),
    lastReplyUsername: info.last_reply_by || topic.lastReplyUsername,
    lastReplyDate: info.last_touched ? formatBeijingTime(info.last_touched * 1000) : topic.lastReplyDate,
    nodeTitle: info.node?.title ?? topic.nodeTitle,
    nodeUrl: info.node?.name ?? topic.nodeUrl,
    checkedAt,
  })
}
