// 每小时叫 GitHub 跑一次「抓取最热」（.github/workflows/collect.yml）。
// GitHub 自己的定时常常几个小时才跑一次，Cloudflare 的定时是准点的；collect.yml 里的定时留着兜底。
// 抓取本身不能放在 Worker 里：V2EX 对部署后的 Worker 发出的请求一律回 403（2026-10-27 实测）。
// 部署与令牌见 README「定时」。

export const WORKFLOW_DISPATCH_URL =
  'https://api.github.com/repos/ryusaksun/VexHotList/actions/workflows/collect.yml/dispatches'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 调 GitHub 的「手动运行」接口跑一次 collect.yml。GITHUB_TOKEN 是只给本仓库 Actions 读写权限的细粒度令牌。
 * 连不上或 GitHub 出错（5xx、429）时最多试 3 次；别的拒绝（令牌过期、权限不够、工作流改了名）重试也一样，直接报错。
 */
export async function dispatchCollect(env, { fetchImpl = fetch, wait = sleep } = {}) {
  if (!env.GITHUB_TOKEN) throw new Error('没有设置 GITHUB_TOKEN：在 trigger 目录运行 npx wrangler secret put GITHUB_TOKEN')
  for (let attempt = 1; ; attempt += 1) {
    const failure = await fetchImpl(WORKFLOW_DISPATCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub 的接口要求带 User-Agent。
        'User-Agent': 'VexHotList-trigger',
      },
      body: JSON.stringify({ ref: 'main' }),
    }).then(
      async (response) => response.ok ? null : {
        retry: response.status >= 500 || response.status === 429,
        message: `GitHub 没接受（HTTP ${response.status}）：${(await response.text()).slice(0, 300)}`,
      },
      (error) => ({ retry: true, message: `连不上 GitHub：${error.message}` }),
    )
    if (!failure) return
    if (!failure.retry || attempt >= 3) throw new Error(failure.message)
    console.warn(`第 ${attempt} 次没成：${failure.message}，稍后重试`)
    await wait(attempt * 10_000)
  }
}

export default {
  async scheduled(_controller, env) {
    // 出错时抛出去，这次运行在 Cloudflare 控制台里记为失败，日志里有原因。
    await dispatchCollect(env)
    console.log('已叫 GitHub 跑一次「抓取最热」')
  },
}
