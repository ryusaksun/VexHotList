// 把存档里的回复数换成真实的。存档停在当天最后一次看到的那一刻（10-31 抽样：真实值中位数是存档的 1.2～1.3 倍，
// 三分之一差 50% 以上），长榜上数字与名次都不准。每次核对一批，写回每天的存档，所有时间范围都受益。
// 接口每个 IP 每小时限 600 次，存档又是每小时跑一次，一次只问一小批。连着几次不通（限额、人机验证）时这次到此为止，不影响抓取与发布。

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dayOfFile, startOfDay } from './lists.mjs'
import { applyTopicInfo, selectForRefresh } from './refresh-lib.mjs'

const hotDir = process.env.HOT_OUT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'hot')
const limit = Number(process.env.HOT_REFRESH_LIMIT ?? 120)
const maxFailures = 3
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

async function fetchTopic(id) {
  const response = await fetch(`https://www.v2ex.com/api/topics/show.json?id=${id}`, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const topics = await response.json()
  if (!Array.isArray(topics)) throw new Error('接口回的不是列表')
  return topics[0] ?? null
}

const days = []
for (const name of await readdir(hotDir)) {
  const day = dayOfFile(name)
  if (day === null) continue
  days.push({ name, day, topics: JSON.parse(await readFile(join(hotDir, name), 'utf8')) })
}

const now = Date.now()
const picks = selectForRefresh(days, startOfDay(new Date(now)), now, limit)
const changed = new Set()
let checked = 0
let failures = 0
for (const { entry, topic } of picks) {
  try {
    const info = await fetchTopic(topic.id)
    entry.topics[entry.topics.indexOf(topic)] = applyTopicInfo(topic, info, now)
    changed.add(entry)
    checked += 1
    failures = 0
  } catch (error) {
    failures += 1
    console.warn(`第 ${topic.id} 条没取到：${error.message}`)
    if (failures >= maxFailures) {
      console.warn('接口连着不通，这次到此为止')
      break
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 150))
}
for (const entry of changed) {
  entry.topics.sort((a, b) => b.replyCount - a.replyCount || b.id - a.id)
  await writeFile(join(hotDir, entry.name), `${JSON.stringify(entry.topics)}\n`)
}
console.log(`核对了 ${checked} 条（这次挑出 ${picks.length} 条）`)
