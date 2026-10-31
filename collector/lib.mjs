// 解析 V2EX「最热」页、把每次抓到的并进当天的存档。不依赖任何第三方包，Node 22 自带的就够。

export const HOT_TAB_URL = 'https://www.v2ex.com/?tab=hot'

/**
 * 网站「最热」页（电脑版 HTML）上的主题，照页面上的顺序。
 * 不是「最热」页（人机验证、出错页）时抛错，免得把空列表当成「今天没有热帖」写进存档。
 */
export function parseHotTab(html) {
  if (!/<a href="\/\?tab=hot" class="tab_current">/.test(html)) {
    throw new Error('拿到的不是「最热」页（可能是人机验证或出错页）')
  }
  return html.split('<div class="cell item"').slice(1).map(parseItem).filter(Boolean)
}

function parseItem(block) {
  const link = block.match(/<a href="\/t\/(\d+)(?:#reply(\d+))?" class="topic-link"[^>]*>([\s\S]*?)<\/a>/)
  if (!link) return null
  const title = decodeEntities(link[3].replace(/<[^>]*>/g, '')).trim()
  // 第一个加粗的会员是作者，第二个是最后回复的人（没人回复时没有）。
  const members = [...block.matchAll(/<strong><a href="\/member\/([^"]+)">/g)].map((match) => match[1])
  if (!title || members.length === 0) return null
  const count = block.match(/class="count_livid">(\d+)</)
  const node = block.match(/<a class="node" href="\/go\/([^"]+)">([^<]*)<\/a>/)
  const time = block.match(/<span title="(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ([+-]\d{2}):?(\d{2})">/)
  return normalize({
    id: Number(link[1]),
    title,
    replyCount: Number(count?.[1] ?? link[2] ?? 0),
    avatar: block.match(/<img src="([^"]+)" class="avatar"/)?.[1] ?? '',
    username: members[0],
    lastReplyUsername: members[1],
    lastReplyDate: time ? beijingTime(time[1], time[2], time[3]) : undefined,
    nodeTitle: node ? decodeEntities(node[2]) : undefined,
    nodeUrl: node?.[1],
  })
}

/**
 * 把这一次抓到的并进这一天已有的。同一主题回复数取大的；标题、节点、头像用这次的；最后回复取时间晚的那份。
 * 这次没抓到的（掉出了「最热」）照样留着：它当天上过「最热」。按回复数从多到少排，一样多时新帖在前。
 */
export function mergeDay(existing, snapshot) {
  const byId = new Map(existing.map((topic) => [topic.id, topic]))
  for (const topic of snapshot) {
    const kept = byId.get(topic.id)
    if (!kept) {
      byId.set(topic.id, topic)
      continue
    }
    const newerReply = (topic.lastReplyDate ?? '') >= (kept.lastReplyDate ?? '')
    byId.set(topic.id, {
      ...kept,
      title: topic.title,
      avatar: topic.avatar || kept.avatar,
      username: topic.username,
      nodeTitle: topic.nodeTitle ?? kept.nodeTitle,
      nodeUrl: topic.nodeUrl ?? kept.nodeUrl,
      replyCount: Math.max(kept.replyCount, topic.replyCount),
      lastReplyUsername: newerReply ? topic.lastReplyUsername : kept.lastReplyUsername,
      lastReplyDate: newerReply ? topic.lastReplyDate : kept.lastReplyDate,
    })
  }
  return [...byId.values()].map(normalize).sort((a, b) => b.replyCount - a.replyCount || b.id - a.id)
}

/** 存档文件名：这一刻所在的 UTC 日（网站「最热」按 UTC 切日，即北京时间早上 8 点），月、日不补零。 */
export function dayFileName(date) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`
}

/**
 * UTC 零点后的头 15 分钟不抓：网站刚换到新的一天，列表几乎是空的；任务排队晚了跨过零点时，
 * 也不会把新一天的空列表记到旧的一天上。
 */
export function isTooCloseToDayStart(date) {
  return date.getUTCHours() === 0 && date.getUTCMinutes() < 15
}

/**
 * 这次抓到的还是昨天的列表：网站的「最热」页有缓存，UTC 零点过后十几分钟有时还是前一天的内容（10-28、10-29、10-30 都碰上了），
 * 记下来「昨天」就混进前一天的帖子。「最热」只列当天新发的帖，有一条在昨天的存档里就是旧页面。
 */
export function isStaleSnapshot(snapshot, yesterday) {
  const ids = new Set(yesterday.map((topic) => topic.id))
  return snapshot.some((topic) => ids.has(topic.id))
}

/** 字段顺序固定（前面几个与 V2Next 的存档相同），没有值的不写。`checkedAt` 是最后一次向接口核对回复数的时刻（秒），见 refresh.mjs。 */
export function normalize(topic) {
  const result = {}
  for (const key of ['id', 'title', 'replyCount', 'avatar', 'username', 'lastReplyUsername', 'lastReplyDate', 'nodeTitle', 'nodeUrl', 'checkedAt']) {
    if (topic[key] !== undefined && topic[key] !== null) result[key] = topic[key]
  }
  return result
}

/** 页面上的时间换成北京时间的「2026-10-26 16:18:23」（App 按北京时间解析）。 */
function beijingTime(local, offsetHours, offsetMinutes) {
  const [date, clock] = local.split(' ')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second] = clock.split(':').map(Number)
  const sign = offsetHours.startsWith('-') ? -1 : 1
  const offset = sign * (Math.abs(Number(offsetHours)) * 60 + Number(offsetMinutes))
  return formatBeijingTime(Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000)
}

/** 毫秒时间戳写成北京时间的「2026-10-26 16:18:23」。 */
export function formatBeijingTime(milliseconds) {
  const beijing = new Date(milliseconds + 8 * 3_600_000)
  const pad = (value) => String(value).padStart(2, '0')
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())} `
    + `${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}`
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return named[entity.toLowerCase()] ?? match
  })
}
