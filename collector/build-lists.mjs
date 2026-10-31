// 生成榜单文件：node collector/build-lists.mjs <输出目录>，存档读 hot/（HOT_OUT_DIR 可换）。

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LISTS, buildList, dayOfFile, startOfDay } from './lists.mjs'

const hotDir = process.env.HOT_OUT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'hot')
const outDir = process.argv[2]
if (!outDir) throw new Error('要给输出目录')

const days = []
for (const name of await readdir(hotDir)) {
  const day = dayOfFile(name)
  if (day === null) continue
  days.push({ day, topics: JSON.parse(await readFile(join(hotDir, name), 'utf8')) })
}
const today = startOfDay(new Date())
await mkdir(outDir, { recursive: true })
for (const { file, firstDay } of LISTS) {
  const list = buildList(days, firstDay(today))
  await writeFile(join(outDir, file), `${JSON.stringify(list)}\n`)
  console.log(`${file}：${list.length} 条`)
}
