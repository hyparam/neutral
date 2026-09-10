// @ts-check
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from '../git.js'
import { planDeferredFindings } from '../findings.js'

// @ref LLP 0075#follow-ups [implements] — one idempotent issue per finding, with automatic admission decided by validated evidence
/** @param {string} repo @param {number} pr @param {string} sha @param {unknown} findings @param {typeof run} [exec] */
export async function deferFindings(repo, pr, sha, findings, exec = run) {
  const plan = planDeferredFindings(pr, sha, findings)
  async function checkHead() {
    const state = JSON.parse(await exec('gh', ['pr', 'view', String(pr), '--json', 'headRefOid,state'], repo))
    if (state.state !== 'OPEN' || state.headRefOid !== sha) throw new Error('PR closed or head changed; re-observe before deferring findings')
  }
  await checkHead()
  const pages = JSON.parse(await exec('gh', ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/issues?state=all&per_page=100'], repo))
  /** @type {Array<{number: number, body?: string, pull_request?: unknown}>} */
  const existing = pages.flat()
  const directory = mkdtempSync(join(tmpdir(), 'neutral-findings-'))
  const result = []
  try {
    for (const issue of plan) {
      const matches = existing.filter(i => !i.pull_request && i.body?.includes(issue.marker))
      if (matches.length > 1) throw new Error(`multiple issues for finding ${issue.ordinal}; reconcile manually`)
      if (matches.length) {
        // Preserve existing labels, including explicit human delegation. A retry is not new admission.
        result.push({ ordinal: issue.ordinal, number: matches[0].number, reused: true })
        continue
      }
      await checkHead()
      const file = join(directory, `${issue.ordinal}.md`)
      writeFileSync(file, issue.body)
      const args = ['issue', 'create', '--title', issue.title, '--body-file', file]
      for (const label of issue.labels) args.push('--label', label)
      const url = (await exec('gh', args, repo)).trim()
      const number = Number(url.match(/\/issues\/(\d+)$/)?.[1])
      if (!number) throw new Error('issue creation returned no issue URL; re-observe before retrying')
      result.push({ ordinal: issue.ordinal, number, reused: false })
    }
    await checkHead()
    return result
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

/** @param {string} repo @param {string[]} args */
export async function deferFindingsCommand(repo, args) {
  if (args.length !== 3) throw new Error('usage: neutral defer-findings <pr> <full-head-sha> <findings.json>')
  const result = await deferFindings(repo, Number(args[0]), args[1], JSON.parse(readFileSync(args[2], 'utf8')))
  process.stdout.write(JSON.stringify(result) + '\n')
  return 0
}
