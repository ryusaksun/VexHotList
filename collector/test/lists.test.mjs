import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LISTS, PROMOTIONS_NODE, buildList, dayOfFile, startOfDay } from '../lists.mjs'

const day = (month, date) => Date.UTC(2026, month - 1, date)
const topic = (id, replyCount, nodeUrl = 'life') => ({ id, title: `t${id}`, replyCount, username: 'u', nodeUrl })

test('存档文件名认得出来，别的文件不算', () => {
  assert.equal(dayOfFile('2026-1-5.json'), day(1, 5))
  assert.equal(dayOfFile('2026-10-25.json'), day(10, 25))
  assert.equal(dayOfFile('top-30d.json'), null)
})

test('合并：只算范围内的日子，同一主题留回复多的，按回复数排，一样多时新帖在前', () => {
  const list = buildList([
    { day: day(1, 1), topics: [topic(1, 900)] },
    { day: day(1, 2), topics: [topic(2, 10), topic(3, 50)] },
    { day: day(1, 3), topics: [topic(2, 30), topic(4, 50)] },
  ], day(1, 2))
  assert.deepEqual(list.map((row) => [row.id, row.replyCount]), [[4, 50], [3, 50], [2, 30]])
})

test('推广节点另算：排除后还有满额，不排除时前 N 名都在', () => {
  const topics = [
    topic(1, 100, PROMOTIONS_NODE), topic(2, 90, PROMOTIONS_NODE), topic(3, 80, PROMOTIONS_NODE),
    topic(4, 70), topic(5, 60), topic(6, 50),
  ]
  const list = buildList([{ day: day(1, 1), topics }], day(1, 1), 2)
  assert.deepEqual(list.map((row) => row.id), [1, 2, 4, 5])
  assert.deepEqual(list.filter((row) => row.nodeUrl !== PROMOTIONS_NODE).map((row) => row.id), [4, 5])
})

test('榜单不带核对时刻', () => {
  const [row] = buildList([{ day: day(1, 1), topics: [{ ...topic(1, 5), checkedAt: 100 }] }], day(1, 1))
  assert.equal('checkedAt' in row, false)
})

test('三份榜单的起点：最近 30 天、90 天（都含今天），今年从 1 月 1 日起', () => {
  const today = startOfDay(new Date(Date.UTC(2026, 9, 31, 13)))
  const [month, quarter, year] = LISTS
  assert.equal(month.firstDay(today), day(10, 2))
  assert.equal(quarter.firstDay(today), day(8, 3))
  assert.equal(year.firstDay(today), day(1, 1))
})
