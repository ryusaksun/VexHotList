import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_REPLIES, SETTLE_DAYS, applyTopicInfo, needsRefresh, selectForRefresh } from '../refresh-lib.mjs'

const dayMs = 86_400_000
const day = (month, date) => Date.UTC(2026, month - 1, date)
const topic = (id, replyCount, checkedAt) => ({ id, title: 'a', replyCount, username: 'u', ...(checkedAt ? { checkedAt } : {}) })

test('回复太少的不核对；没核对过的要', () => {
  const now = day(10, 31)
  assert.equal(needsRefresh(topic(1, MIN_REPLIES - 1), day(10, 1), now), false)
  assert.equal(needsRefresh(topic(1, MIN_REPLIES), day(10, 1), now), true)
})

test('核对时还没稳定的隔一天再核对，稳定之后核对过一次就不再管', () => {
  const postDay = day(10, 1)
  const now = day(10, 10)
  assert.equal(needsRefresh(topic(1, 50, (now - dayMs / 2) / 1000), postDay, now), false, '半天前刚核对过')
  assert.equal(needsRefresh(topic(1, 50, (now - dayMs) / 1000), postDay, now), true, '一天前核对的，还没稳定')
  const settled = postDay + SETTLE_DAYS * dayMs
  assert.equal(needsRefresh(topic(1, 50, settled / 1000), postDay, settled + 30 * dayMs), false, '稳定之后核对过')
})

test('挑选：没核对过的在前、回复多的先来，今天的与往年的不挑，不超过上限', () => {
  const today = day(10, 31)
  const now = today + 3_600_000
  const days = [
    { day: day(12, 31) - 365 * dayMs, topics: [topic(1, 500)] },
    { day: day(10, 1), topics: [topic(2, 40), topic(3, 400)] },
    { day: day(10, 30), topics: [topic(4, 90, (now - 2 * dayMs) / 1000)] },
    { day: today, topics: [topic(5, 900)] },
  ]
  assert.deepEqual(selectForRefresh(days, today, now, 10).map(({ topic: row }) => row.id), [3, 2, 4])
  assert.deepEqual(selectForRefresh(days, today, now, 1).map(({ topic: row }) => row.id), [3])
})

test('写回：回复数只升不降，节点与最后回复用接口的，记下核对时刻', () => {
  const now = Date.UTC(2026, 9, 31, 2)
  const before = { id: 1, title: '旧', replyCount: 100, username: 'u', lastReplyUsername: 'x', nodeUrl: 'life', nodeTitle: '生活' }
  const after = applyTopicInfo(before, {
    title: '新', replies: 180, last_reply_by: 'y', last_touched: Date.UTC(2026, 9, 26, 8, 18, 23) / 1000,
    node: { name: 'promotions', title: '推广' },
  }, now)
  assert.deepEqual(after, {
    id: 1, title: '新', replyCount: 180, username: 'u', lastReplyUsername: 'y', lastReplyDate: '2026-10-26 16:18:23',
    nodeTitle: '推广', nodeUrl: 'promotions', checkedAt: now / 1000,
  })
  assert.equal(applyTopicInfo(before, { replies: 3 }, now).replyCount, 100)
})

test('接口没有这个主题：只记下核对过', () => {
  const now = Date.UTC(2026, 9, 31, 2)
  const before = topic(1, 100)
  assert.deepEqual(applyTopicInfo(before, null, now), { ...before, checkedAt: now / 1000 })
})
