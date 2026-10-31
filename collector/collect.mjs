// 抓一次 V2EX 的「最热」，并进当天（UTC 日）的存档 hot/<年-月-日>.json。GitHub Actions 每小时跑一次。
// 本地试跑：HOT_OUT_DIR=/tmp/hot node collector/collect.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOT_TAB_URL, dayFileName, isStaleSnapshot, isTooCloseToDayStart, mergeDay, parseHotTab } from './lib.mjs'

const outDir = process.env.HOT_OUT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'hot')
// 电脑版页面：列表结构与解析规则对应。
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

async function fetchHotTab() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(HOT_TAB_URL, {
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      // 按网站回应的时间定是哪一天，不按任务开跑的时间。
      const served = new Date(response.headers.get('date') ?? Date.now())
      return { topics: parseHotTab(html), date: Number.isNaN(served.getTime()) ? new Date() : served }
    } catch (error) {
      if (attempt >= 3) throw error
      console.warn(`第 ${attempt} 次没取到：${error.message}，稍后重试`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 10_000))
    }
  }
}

const { topics, date } = await fetchHotTab()
if (isTooCloseToDayStart(date)) {
  console.log('UTC 零点后 15 分钟内，这次不记')
  process.exit(0)
}

async function readDay(day) {
  try {
    return JSON.parse(await readFile(join(outDir, `${dayFileName(day)}.json`), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return []
  }
}

if (isStaleSnapshot(topics, await readDay(new Date(date.getTime() - 86_400_000)))) {
  console.log('网站还是昨天的列表，这次不记')
  process.exit(0)
}
const path = join(outDir, `${dayFileName(date)}.json`)
const merged = mergeDay(await readDay(date), topics)
await mkdir(outDir, { recursive: true })
await writeFile(path, `${JSON.stringify(merged)}\n`)
console.log(`${dayFileName(date)}：这次 ${topics.length} 条，当天共 ${merged.length} 条`)
