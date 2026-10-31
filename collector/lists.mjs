// 1 个月、3 个月、今年的榜单：把每天的存档合起来，按回复数排好，App 只下一个文件。

/** 网站的「推广」节点。时间拉长后榜单上全是回帖送码的推广帖，App 里可以选择不看（设置 › 最热时间范围）。 */
export const PROMOTIONS_NODE = 'promotions'
/** 每份榜单最多多少条。「推广」节点另算：不排除时前 100 名都在文件里，排除后也还有 100 条。 */
export const LIST_LIMIT = 100

export const LISTS = [
  { file: 'top-30d.json', firstDay: (today) => addDays(today, -29) },
  { file: 'top-90d.json', firstDay: (today) => addDays(today, -89) },
  { file: 'top-year.json', firstDay: (today) => Date.UTC(new Date(today).getUTCFullYear(), 0, 1) },
]

export function addDays(day, days) {
  return day + days * 86_400_000
}

/** 这个时刻所在 UTC 日的零点。 */
export function startOfDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** 存档文件名对应的 UTC 日零点；不是存档文件时是 null。 */
export function dayOfFile(name) {
  const match = name.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\.json$/)
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

const byReplies = (a, b) => b.replyCount - a.replyCount || b.id - a.id

/**
 * `days` 是 `[{ day, topics }]`。`first` 起的日子合在一起：同一主题留回复数多的那份，按回复数从多到少排，
 * 「推广」节点与其余的各留前 `limit` 条。不要核对时刻：App 用不上。
 */
export function buildList(days, first, limit = LIST_LIMIT) {
  const best = new Map()
  for (const { day, topics } of days) {
    if (day < first) continue
    for (const topic of topics) {
      const kept = best.get(topic.id)
      if (!kept || kept.replyCount < topic.replyCount) best.set(topic.id, topic)
    }
  }
  const sorted = [...best.values()].sort(byReplies)
  const promotions = sorted.filter((topic) => topic.nodeUrl === PROMOTIONS_NODE).slice(0, limit)
  const others = sorted.filter((topic) => topic.nodeUrl !== PROMOTIONS_NODE).slice(0, limit)
  return [...others, ...promotions].sort(byReplies).map(({ checkedAt, ...topic }) => topic)
}
