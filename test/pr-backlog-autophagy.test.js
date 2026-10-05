// @ts-check
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, loadConfig } from '../src/config.js'
import { selectInitiative } from '../src/autophagy.js'
import { observePRBacklog } from '../src/github.js'
import { collectIdle } from '../src/commands/idle.js'

/** @import { run } from '../src/git.js' */

const config = { ...DEFAULT_CONFIG, autophagy: { ...DEFAULT_CONFIG.autophagy, codeCleanup: false, prBacklog: true } }
const now = Date.parse('2026-09-17T12:00:00Z')
/** @param {number} number */
const pull = number => ({ number, state: 'open', html_url: `https://github.com/example/repo/pull/${number}`,
  title: `PR ${number}`, head: { ref: `feature/${number}`, sha: 'head' },
  base: { ref: 'main', sha: 'base' }, updated_at: '2026-09-17T00:00:00Z' })
/** @param {Partial<Parameters<typeof selectInitiative>[0]>} [over] */
const select = (over = {}) => selectInitiative({ config, now, openPRs: [], disposed: [], backlogCount: 1, ...over })

// @ref LLP 0079#configuration [tests] — optional, typed switch
test('PR backlog is opt-in; invalid config values do not enable it', () => {
  const repo = mkdtempSync(join(tmpdir(), 'neutral-pr-backlog-'))
  try {
    mkdirSync(join(repo, '.neutral'))
    assert.equal(loadConfig(repo).autophagy.prBacklog, false)
    for (const value of [true, false, 'true', 1, null]) {
      writeFileSync(join(repo, '.neutral/config.json'), JSON.stringify({ autophagy: { prBacklog: value } }))
      assert.equal(loadConfig(repo).autophagy.prBacklog, value === true)
    }
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// @ref LLP 0079#observation [tests] — distinguish absent evidence from an empty inventory
test('selector requires a nonempty observed backlog and respects shared gates', () => {
  assert.equal(select().initiative, 'pr-backlog')
  for (const backlogCount of [0, null]) {
    const s = select({ backlogCount })
    assert.equal(s.initiative, null)
    assert.match(s.members[1].reason, backlogCount === 0 ? /empty/ : /unavailable/)
  }
  assert.equal(select({ config: DEFAULT_CONFIG, damped: ['cleanup'] }).initiative, null)
  assert.equal(select({ openPRs: [{ number: 7, head: 'autophagy/cleanup-old' }] }).initiative, null)
  assert.equal(select({ disposed: [{ headRefName: 'autophagy/pr-backlog-old',
    mergedAt: null, closedAt: new Date(now - 25 * 3600_000).toISOString() }] }).initiative, null)
  assert.equal(select({ disposed: [{ headRefName: 'autophagy/pr-backlog-old',
    mergedAt: new Date(now - 25 * 3600_000).toISOString(), closedAt: new Date(now - 25 * 3600_000).toISOString() }] }).initiative, 'pr-backlog')
  const both = { ...config, autophagy: { ...config.autophagy, codeCleanup: true } }
  assert.equal(select({ config: both }).initiative, 'cleanup')
  assert.equal(select({ config: both, disposed: [{ headRefName: 'autophagy/cleanup-old',
    mergedAt: new Date(now - 48 * 3600_000).toISOString(), closedAt: new Date(now - 48 * 3600_000).toISOString() }] }).initiative, 'pr-backlog')
})

// @ref LLP 0079#observation [tests] — no cap and no fail-open interpretation
test('observer includes every page and rejects incomplete or malformed observations', async () => {
  const pages = [Array.from({ length: 100 }, (_, i) => pull(i + 1)), [pull(101)]]
  const s = await observePRBacklog('.', async (cmd, args) => {
    assert.equal(cmd, 'gh')
    assert.ok(args.includes('--paginate'))
    assert.ok(args.includes('--slurp'))
    return JSON.stringify(pages)
  })
  assert.equal(s.prs.length, 101)
  assert.equal(s.error, null)
  assert.ok(s.fingerprint)
  for (const raw of ['not json', '{}', '[]', '[{}]', JSON.stringify([[{}]]), JSON.stringify([[pull(1)], [pull(1)]])]) {
    const failed = await observePRBacklog('.', async () => raw)
    assert.equal(failed.fingerprint, null)
    assert.match(failed.error ?? '', /unavailable/)
  }
  const failed = await observePRBacklog('.', async () => { throw new Error('offline') })
  assert.equal(failed.fingerprint, null)
  const empty = await observePRBacklog('.', async () => '[[]]')
  assert.deepEqual(empty.prs, [])
  assert.ok(empty.fingerprint)
})

// @ref LLP 0079#damping [tests] — PR changes without a target HEAD change wake the member
test('fingerprints ignore enumeration order and change with PR/base activity', async () => {
  /** @param {ReturnType<typeof pull>[]} prs */
  const read = async prs => (await observePRBacklog('.', async () => JSON.stringify([prs]))).fingerprint
  const original = await read([pull(1), pull(2)])
  assert.equal(original, await read([pull(2), pull(1)]))
  for (const changed of [
    [pull(1)], [pull(1), pull(2), pull(3)],
    [pull(1), { ...pull(2), head: { ref: 'feature/2', sha: 'new-head' } }],
    [pull(1), { ...pull(2), base: { ref: 'main', sha: 'new-base' } }],
    [pull(1), { ...pull(2), updated_at: '2026-09-17T01:00:00Z' }]
  ]) assert.notEqual(original, await read(changed))
})

// @ref LLP 0079#configuration [tests] — exercise the real CLI collector with offline boundaries
test('idle collector selects the audit, validates snapshot hints, and keeps existing gates', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'neutral-pr-backlog-'))
  let pages = [[pull(1)]]
  let offline = false
  let busy = false
  /** @type {run} */
  const exec = async (cmd, args) => {
    if (cmd === 'git') return ''
    if (cmd === 'gh' && args[0] === 'api') {
      if (offline) throw new Error('offline')
      return JSON.stringify(pages)
    }
    if (cmd === 'gh' && args[0] === 'issue' && busy) return JSON.stringify([{ number: 3, title: 'fix', labels: [{ name: 'neutral:fix' }] }])
    return '[]'
  }
  try {
    mkdirSync(join(repo, '.neutral'))
    const configure = (maxActiveWork = 6) => writeFileSync(join(repo, '.neutral/config.json'), JSON.stringify({ ...config, maxActiveWork }))
    configure()
    const first = await collectIdle(repo, exec, () => 100)
    assert.equal(first.initiative, 'pr-backlog')
    const backlogSnapshot = first.prBacklog?.fingerprint ?? undefined
    const damped = await collectIdle(repo, exec, () => 100, { backlogSnapshot })
    assert.equal(damped.initiative, null)
    assert.match(damped.members[1].reason, /snapshot unchanged/)
    assert.equal((await collectIdle(repo, exec, () => 100, { damped: ['pr-backlog'] })).initiative, 'pr-backlog')
    pages = [[pull(1), pull(2)]]
    assert.equal((await collectIdle(repo, exec, () => 100, { backlogSnapshot })).initiative, 'pr-backlog')
    assert.equal((await collectIdle(repo, exec, () => 900_000)).initiative, 'recycle')
    busy = true
    assert.equal((await collectIdle(repo, exec, () => 100)).initiative, null)
    busy = false
    configure(0)
    assert.equal((await collectIdle(repo, exec, () => 100)).initiative, null)
    configure()
    pages = [[{ ...pull(1), head: { ref: 'autophagy/cleanup-existing', sha: 'head' } }]]
    assert.equal((await collectIdle(repo, exec, () => 100)).initiative, null)
    pages = [[]]
    assert.equal((await collectIdle(repo, exec, () => 100)).initiative, null)
    offline = true
    const failed = await collectIdle(repo, exec, () => 100)
    assert.equal(failed.initiative, null)
    assert.match(failed.members[1].reason, /unavailable/)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
