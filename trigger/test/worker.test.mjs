import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker, { WORKFLOW_DISPATCH_URL, dispatchCollect } from '../worker.js'

const env = { GITHUB_TOKEN: 'github_pat_test' }

/** 依次回放给定的结果：数字是 HTTP 状态码，Error 是连不上。记下每次请求与每次等待。 */
function fakeGitHub(...outcomes) {
  const requests = []
  const waits = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, init })
    const outcome = outcomes[requests.length - 1]
    if (outcome instanceof Error) throw outcome
    return new Response(outcome === 204 ? null : '{"message":"Bad credentials"}', { status: outcome })
  }
  return { requests, waits, options: { fetchImpl, wait: async (ms) => { waits.push(ms) } } }
}

test('调 GitHub 的「手动运行」接口跑 main 上的 collect.yml，带令牌与 User-Agent', async () => {
  const github = fakeGitHub(204)
  await dispatchCollect(env, github.options)
  assert.equal(github.requests.length, 1)
  const { url, init } = github.requests[0]
  assert.equal(url, 'https://api.github.com/repos/ryusaksun/VexHotList/actions/workflows/collect.yml/dispatches')
  assert.equal(url, WORKFLOW_DISPATCH_URL)
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.Authorization, 'Bearer github_pat_test')
  assert.equal(init.headers.Accept, 'application/vnd.github+json')
  assert.ok(init.headers['User-Agent'])
  assert.deepEqual(JSON.parse(init.body), { ref: 'main' })
})

test('没设置令牌：直接报错，不发请求', async () => {
  const github = fakeGitHub(204)
  await assert.rejects(dispatchCollect({}, github.options), /没有设置 GITHUB_TOKEN/)
  assert.equal(github.requests.length, 0)
})

test('令牌失效、权限不够（4xx）：不重试，报出状态码与 GitHub 的说明', async () => {
  const github = fakeGitHub(401, 204)
  await assert.rejects(dispatchCollect(env, github.options), /HTTP 401.*Bad credentials/)
  assert.equal(github.requests.length, 1)
  assert.deepEqual(github.waits, [])
})

test('GitHub 出错或连不上：隔 10 秒、20 秒再试，第三次成了就算成', async () => {
  const github = fakeGitHub(502, new Error('network down'), 204)
  await dispatchCollect(env, github.options)
  assert.equal(github.requests.length, 3)
  assert.deepEqual(github.waits, [10_000, 20_000])
})

test('试满 3 次都不成：报最后一次的原因', async () => {
  const github = fakeGitHub(503, 503, new Error('network down'))
  await assert.rejects(dispatchCollect(env, github.options), /连不上 GitHub：network down/)
  assert.equal(github.requests.length, 3)
})

test('定时触发时用环境里的令牌发请求', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init })
    return new Response(null, { status: 204 })
  })
  t.mock.method(console, 'log', () => {})
  await worker.scheduled({ cron: '17 * * * *' }, env, {})
  assert.equal(requests.length, 1)
  assert.equal(requests[0].init.headers.Authorization, 'Bearer github_pat_test')
})
