import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dayFileName, formatBeijingTime, isStaleSnapshot, isTooCloseToDayStart, mergeDay, parseHotTab } from '../lib.mjs'

const fixture = readFileSync(new URL('./fixtures/tab-hot.html', import.meta.url), 'utf8')

test('解析「最热」页：字段与 V2Next 的存档相同，最后回复时间换成北京时间', () => {
  const topics = parseHotTab(fixture)
  assert.deepEqual(topics.map((topic) => topic.id), [1251749, 1251768, 1251790])
  assert.deepEqual(topics[0], {
    id: 1251749,
    title: '偶然和一个在药店工作的女生聊了聊',
    replyCount: 132,
    avatar: 'https://cdn.v2ex.com/avatar/6ff6/40c3/101_large.png?m=1',
    username: 'alice',
    lastReplyUsername: 'bob',
    lastReplyDate: '2026-10-26 16:18:23',
    nodeTitle: '健康',
    nodeUrl: 'fit',
  })
  // 字段顺序固定。
  assert.deepEqual(Object.keys(topics[0]), [
    'id', 'title', 'replyCount', 'avatar', 'username', 'lastReplyUsername', 'lastReplyDate', 'nodeTitle', 'nodeUrl',
  ])
})

test('标题里的转义字符还原；别的时区的时间换算成北京时间', () => {
  const topic = parseHotTab(fixture)[1]
  assert.equal(topic.title, "A & B <C> 'Q' 你")
  assert.equal(topic.avatar, 'https://cdn.v2ex.com/gravatar/5d44?s=48&d=retro')
  // 03:00 -05:00 = 08:00 UTC = 16:00 北京时间。
  assert.equal(topic.lastReplyDate, '2026-10-26 16:00:00')
})

test('没人回复的主题：回复数 0，没有最后回复人', () => {
  const topic = parseHotTab(fixture)[2]
  assert.equal(topic.replyCount, 0)
  assert.equal(topic.lastReplyUsername, undefined)
  assert.equal(topic.username, 'erin')
})

test('拿到的不是「最热」页（人机验证、出错页）时报错，不当成空列表', () => {
  assert.throws(() => parseHotTab('<html><title>Just a moment...</title></html>'), /不是「最热」页/)
  assert.throws(() => parseHotTab(fixture.replace('class="tab_current">最热', 'class="tab">最热')))
})

test('并进当天：回复数取大的，最后回复取时间晚的，掉出最热的照样留着，按回复数排', () => {
  const morning = [
    { id: 1, title: '旧标题', replyCount: 50, avatar: 'a', username: 'u1', lastReplyUsername: 'x', lastReplyDate: '2026-10-26 12:00:00', nodeTitle: '节点', nodeUrl: 'n' },
    { id: 2, title: '后来掉出最热', replyCount: 30, avatar: 'b', username: 'u2' },
  ]
  const evening = [
    { id: 1, title: '新标题', replyCount: 80, avatar: 'a2', username: 'u1', lastReplyUsername: 'y', lastReplyDate: '2026-10-26 20:00:00', nodeTitle: '节点', nodeUrl: 'n' },
    { id: 3, title: '晚上新上来的', replyCount: 30, avatar: 'c', username: 'u3' },
  ]
  const merged = mergeDay(morning, evening)
  assert.deepEqual(merged.map((topic) => topic.id), [1, 3, 2], '同为 30 回复时新帖在前')
  assert.equal(merged[0].title, '新标题')
  assert.equal(merged[0].replyCount, 80)
  assert.equal(merged[0].lastReplyUsername, 'y')

  // 页面上的回复数偶尔比之前记的少（删了回复）：保留大的，最后回复仍取时间晚的。
  const later = mergeDay(merged, [{ ...evening[0], replyCount: 79, lastReplyUsername: 'z', lastReplyDate: '2026-10-26 21:00:00' }])
  assert.equal(later[0].replyCount, 80)
  assert.equal(later[0].lastReplyUsername, 'z')
})

test('存档按 UTC 日（北京时间早上 8 点）分文件，月、日不补零', () => {
  assert.equal(dayFileName(new Date('2026-10-25T23:59:59Z')), '2026-10-25')
  assert.equal(dayFileName(new Date('2026-10-26T00:00:00Z')), '2026-10-26')
  assert.equal(dayFileName(new Date('2026-09-07T12:00:00Z')), '2026-9-7')
})

test('UTC 零点后 15 分钟内不记', () => {
  assert.equal(isTooCloseToDayStart(new Date('2026-10-26T00:00:00Z')), true)
  assert.equal(isTooCloseToDayStart(new Date('2026-10-26T00:14:59Z')), true)
  assert.equal(isTooCloseToDayStart(new Date('2026-10-26T00:15:00Z')), false)
  assert.equal(isTooCloseToDayStart(new Date('2026-10-25T23:59:00Z')), false)
})

test('网站还是昨天的列表：有一条在昨天的存档里就不记', () => {
  const yesterday = [{ id: 1, replyCount: 9 }, { id: 2, replyCount: 8 }]
  assert.equal(isStaleSnapshot([{ id: 2, replyCount: 9 }, { id: 3, replyCount: 1 }], yesterday), true)
  assert.equal(isStaleSnapshot([{ id: 3, replyCount: 1 }], yesterday), false)
  assert.equal(isStaleSnapshot([{ id: 3, replyCount: 1 }], []), false, '没有昨天的存档时照常记')
})

test('并进当天时留着核对时刻', () => {
  const merged = mergeDay([{ id: 1, title: 'a', replyCount: 9, username: 'u', checkedAt: 100 }],
    [{ id: 1, title: 'b', replyCount: 7, username: 'u' }])
  assert.equal(merged[0].checkedAt, 100)
  assert.equal(merged[0].replyCount, 9)
})

test('时间戳写成北京时间', () => {
  assert.equal(formatBeijingTime(Date.UTC(2026, 9, 26, 8, 18, 23)), '2026-10-26 16:18:23')
})
