// @ts-check
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectPRs } from '../src/commands/prs.js'
import { collectIssues } from '../src/commands/issues.js'

/**
 * A fake runner that answers both `git` (for-each-ref) and `gh` (pr/issue), so the
 * maintenance observe surface can be exercised fully offline.
 * @param {{prs?: any[], views?: Record<number, any>, issues?: any[], fixBranches?: string[], mergedPrs?: any[], queuedIds?: string[]}} cfg
 * @returns {import('../src/git.js').run}
 */
function fakeWorld({ prs = [], views = {}, issues = [], fixBranches = [], mergedPrs = [], queuedIds = [] } = {}) {
  return async (cmd, args) => {
    if (cmd === 'git' && args[0] === 'for-each-ref') {
      // only the `fix/*` lookup is exercised here
      return fixBranches.map((b, i) => `${b}\0${String(i + 1).padStart(40, '0')}`).join('\n') + '\n'
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'list') {
      if (args[args.indexOf('--state') + 1] === 'merged') {
        return JSON.stringify(mergedPrs.map(p => ({ number: p.number, headRefName: p.headRefName, labels: p.labels || [] })))
      }
      const fields = args[args.indexOf('--json') + 1]
      return JSON.stringify(prs.map(p => fields.includes('body')
        ? { number: p.number, body: p.body || '', headRefName: p.headRefName, headRefOid: p.headRefOid || '', state: p.state || 'OPEN' }
        : { number: p.number, headRefName: p.headRefName, labels: p.labels || [] }))
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify(views[Number(args[2])])
    }
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'list') {
      return JSON.stringify(issues)
    }
    if (cmd === 'gh' && args[0] === 'api' && args[1] === 'graphql') {
      const id = String(args.find(a => String(a).startsWith('id=')) || '').slice(3)
      return JSON.stringify({ data: { node: { mergeQueueEntry: queuedIds.includes(id) ? { id: `entry-${id}` } : null } } })
    }
    throw new Error('unexpected ' + cmd + ' ' + args.join(' '))
  }
}

test('collectPRs keeps only neutral-owned heads and attaches a rung decision', async () => {
  const exec = fakeWorld({
    prs: [
      { number: 1, headRefName: 'integration/auth' },  // own
      { number: 2, headRefName: 'fix/issue-9' },        // own
      { number: 3, headRefName: 'feature/from-a-human' } // foreign — out of scope (deferred)
    ],
    views: {
      1: { number: 1, headRefName: 'integration/auth', baseRefName: 'main', isDraft: true, mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND', statusCheckRollup: [], headRefOid: 'aaa' },
      2: { number: 2, headRefName: 'fix/issue-9', baseRefName: 'main', isDraft: true, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', statusCheckRollup: [], headRefOid: 'bbb' }
    }
  })
  const got = await collectPRs('/r', exec)
  assert.deepEqual(got.map(p => [p.number, p.rung, p.action]), [
    [1, 'mergeable', 'merge-base'],
    [2, 'mergeable', 'resolve-conflict']
  ])
})

test('collectPRs is empty when there are no open PRs (offline-safe)', async () => {
  assert.deepEqual(await collectPRs('/r', fakeWorld({ prs: [] })), [])
})

test('collectPRs adopts a pushable neutral:adopt PR as its OWN — foreign: false (LLP 0025/0058)', async () => {
  const exec = fakeWorld({
    prs: [
      { number: 3, headRefName: 'feature/from-a-human' },                          // foreign, NO label -> excluded
      { number: 4, headRefName: 'contrib/patch', labels: [{ name: 'neutral:adopt' }] } // adopted -> in scope, own ladder
    ],
    views: {
      4: { number: 4, headRefName: 'contrib/patch', baseRefName: 'main', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [], headRefOid: 'ddd', body: '', isCrossRepository: true, maintainerCanModify: true }
    }
  })
  const got = await collectPRs('/r', exec)
  // only #4 is picked up; a pushable adoption is no longer foreign — own ladder, unreviewed head -> review
  assert.deepEqual(got.map(p => [p.number, p.foreign, p.adopted, p.canPush, p.action]), [[4, false, true, true, 'review']])
})

test('an adopted PR rides the own ladder through ship-risk-gated automerge (LLP 0058/0062/0069)', async () => {
  // A pushable adoption is own, so its reviewed-clean final head receives the same
  // ship-risk assessment and threshold-gated landing decision as an integration PR.
  const exec = fakeWorld({
    prs: [{ number: 9, headRefName: 'contrib/patch', labels: [{ name: 'neutral:adopt' }, { name: 'neutral:adopted' }] }],
    views: {
      9: { number: 9, headRefName: 'contrib/patch', baseRefName: 'main', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [], headRefOid: 'abc1234', body: '<!-- neutral-review: abc1234 -->', comments: [{ author: { login: 'phil' }, body: '<!-- neutral-ship-risk: abc1234 low e4 v1 -->\nproof', createdAt: '1' }], labels: [{ name: 'neutral:adopt' }, { name: 'neutral:adopted' }], isCrossRepository: true, maintainerCanModify: true }
    }
  })
  const repo = mkdtempSync(join(tmpdir(), 'neutral-prs-'))
  try {
    // without automerge: the own reviewed-clean terminal, held for a human
    assert.deepEqual((await collectPRs(repo, exec)).map(p => [p.number, p.foreign, p.adopted, p.action]), [[9, false, true, 'held']])
    mkdirSync(join(repo, '.neutral'))
    writeFileSync(join(repo, '.neutral', 'config.json'), JSON.stringify({ automerge: true }))
    const [gated] = await collectPRs(repo, exec)
    assert.equal(gated.action, 'merge')
    assert.equal(gated.shipRiskEligible, true)
    assert.equal(gated.wouldAutomerge, true)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('collectPRs queue mode ignores BEHIND, enqueues a clean terminal, then waits in queue (LLP 0060)', async () => {
  const base = {
    id: 'PR_1', number: 1, headRefName: 'integration/auth', baseRefName: 'main', isDraft: false,
    mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND', statusCheckRollup: [],
    headRefOid: 'abc1234', body: '<!-- neutral-review: abc1234 -->'
  }
  const repo = mkdtempSync(join(tmpdir(), 'neutral-prs-'))
  try {
    mkdirSync(join(repo, '.neutral'))
    writeFileSync(join(repo, '.neutral', 'config.json'), JSON.stringify({ automerge: true, mergeQueue: true, shipRisk: { mode: 'off' } }))
    const open = fakeWorld({ prs: [{ number: 1, headRefName: 'integration/auth' }], views: { 1: base } })
    assert.equal((await collectPRs(repo, open))[0].action, 'enqueue')
    const queued = fakeWorld({ prs: [{ number: 1, headRefName: 'integration/auth' }], views: { 1: base }, queuedIds: ['PR_1'] })
    const [p] = await collectPRs(repo, queued)
    assert.equal(p.action, 'wait')
    assert.equal(p.queued, true)
    assert.equal(p.approved, true)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// @ref LLP 0069#deterministic-decision [tests]
test('collectPRs threads ship risk into low-only automerge queue admission (LLP 0069)', async () => {
  /** @param {number} number @param {'low'|'medium'} level */
  const view = (number, level) => ({
    id: `PR_${number}`, number, headRefName: `integration/risk-${level}`, baseRefName: 'main', isDraft: false,
    mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [],
    headRefOid: 'abc1234', body: '<!-- neutral-review: abc1234 -->',
    comments: [{ author: { login: 'phil' }, body: `<!-- neutral-ship-risk: abc1234 ${level} e4 v1 -->\nproof`, createdAt: '1' }]
  })
  const exec = fakeWorld({
    prs: [
      { number: 1, headRefName: 'integration/risk-low' },
      { number: 2, headRefName: 'integration/risk-medium' }
    ],
    views: { 1: view(1, 'low'), 2: view(2, 'medium') }
  })
  const repo = mkdtempSync(join(tmpdir(), 'neutral-prs-'))
  try {
    mkdirSync(join(repo, '.neutral'))
    writeFileSync(join(repo, '.neutral', 'config.json'), JSON.stringify({
      automerge: true,
      mergeQueue: true,
      shipRisk: { mode: 'observe', maxAutomerge: 'low' }
    }))
    const got = await collectPRs(repo, exec)
    assert.deepEqual(got.map(p => [p.number, p.action, p.shipRiskEligible, p.wouldAutomerge]), [
      [1, 'enqueue', true, true],
      [2, 'held', false, false]
    ])
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('collectPRs review-only degrades an unpushable fork to request-changes on a stale base (LLP 0025)', async () => {
  const exec = fakeWorld({
    prs: [{ number: 5, headRefName: 'contrib/patch', labels: [{ name: 'neutral:adopt' }] }],
    views: {
      5: { number: 5, headRefName: 'contrib/patch', baseRefName: 'main', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND', statusCheckRollup: [], headRefOid: 'eee', body: '', isCrossRepository: true, maintainerCanModify: false }
    }
  })
  const got = await collectPRs('/r', exec)
  assert.deepEqual(got.map(p => [p.number, p.foreign, p.canPush, p.action]), [[5, true, false, 'request-changes']])
})

test('collectPRs scopes a neutral:review PR as review-only, even when pushable; review wins over adopt (LLP 0032)', async () => {
  const exec = fakeWorld({
    prs: [
      { number: 6, headRefName: 'contrib/one', labels: [{ name: 'neutral:review' }] },                              // review-only by label
      { number: 7, headRefName: 'contrib/two', labels: [{ name: 'neutral:adopt' }, { name: 'neutral:review' }] }    // both -> narrower grant wins
    ],
    views: {
      // same-repo branch (canPush true) sitting BEHIND: adopt would heal (merge-base); review must not
      6: { number: 6, headRefName: 'contrib/one', baseRefName: 'main', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND', statusCheckRollup: [], headRefOid: 'aaa', body: '', labels: [{ name: 'neutral:review' }] },
      7: { number: 7, headRefName: 'contrib/two', baseRefName: 'main', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND', statusCheckRollup: [], headRefOid: 'bbb', body: '', labels: [{ name: 'neutral:adopt' }, { name: 'neutral:review' }] }
    }
  })
  const got = await collectPRs('/r', exec)
  assert.deepEqual(got.map(p => [p.number, p.foreign, p.reviewOnly, p.canPush, p.action]), [
    [6, true, true, true, 'request-changes'],
    [7, true, true, true, 'request-changes']
  ])
})

test('collectPRs stamps engagement: an open adopted PR without neutral:adopted flags markAdopted (LLP 0037)', async () => {
  const exec = fakeWorld({
    prs: [
      { number: 1, headRefName: 'integration/own' },                                                                  // own -> never stamped
      { number: 4, headRefName: 'contrib/patch', labels: [{ name: 'neutral:adopt' }] },                               // engaged -> stamp
      { number: 6, headRefName: 'contrib/done', labels: [{ name: 'neutral:adopt' }, { name: 'neutral:adopted' }] },   // already stamped -> silent
      { number: 8, headRefName: 'contrib/ro', labels: [{ name: 'neutral:review' }] }                                  // review-only, not an adoption
    ],
    views: {
      1: { number: 1, headRefName: 'integration/own', baseRefName: 'main', isDraft: true, mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND', statusCheckRollup: [], headRefOid: 'aaa', body: '' },
      4: { number: 4, headRefName: 'contrib/patch', baseRefName: 'main', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [], headRefOid: 'bbb', body: '', labels: [{ name: 'neutral:adopt' }], isCrossRepository: true, maintainerCanModify: true },
      6: { number: 6, headRefName: 'contrib/done', baseRefName: 'main', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [], headRefOid: 'ccc', body: '', labels: [{ name: 'neutral:adopt' }, { name: 'neutral:adopted' }], isCrossRepository: true, maintainerCanModify: true },
      8: { number: 8, headRefName: 'contrib/ro', baseRefName: 'main', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [], headRefOid: 'ddd', body: '', labels: [{ name: 'neutral:review' }] }
    }
  })
  const got = await collectPRs('/r', exec)
  assert.deepEqual(got.map(p => [p.number, p.markAdopted]), [
    [1, false],
    [4, true],
    [6, false],
    [8, false]
  ])
})

test('collectPRs owes a merged adoption its completion record exactly once (LLP 0031)', async () => {
  const exec = fakeWorld({
    mergedPrs: [
      { number: 6, headRefName: 'contrib/patch', labels: [{ name: 'neutral:adopt' }, { name: 'neutral:approved' }] }, // owed
      { number: 7, headRefName: 'contrib/other', labels: [{ name: 'neutral:adopt' }, { name: 'neutral:adopted' }] },  // recorded -> silent
      { number: 8, headRefName: 'integration/own', labels: [{ name: 'neutral:adopt' }] }                              // own head -> not an adoption
    ]
  })
  const got = await collectPRs('/r', exec)
  assert.deepEqual(got.map(p => [p.number, p.rung, p.action]), [[6, 'terminal', 'mark-adopted']])
})

test('collectPRs surfaces the unstick action and the guidance count for a stuck PR with a human reply (LLP 0027)', async () => {
  const exec = fakeWorld({
    prs: [{ number: 5, headRefName: 'integration/auth' }],
    views: {
      5: {
        number: 5, headRefName: 'integration/auth', baseRefName: 'main', isDraft: true,
        mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [], headRefOid: 'abc1234',
        labels: [{ name: 'neutral:stuck' }],
        comments: [
          { author: { login: 'phil' }, body: '<!-- neutral-stuck: abc1234 -->\nStuck: which auth flow?', createdAt: '1' },
          { author: { login: 'phil' }, body: 'use OAuth device flow', createdAt: '2' }
        ]
      }
    }
  })
  const [p] = await collectPRs('/r', exec)
  assert.equal(p.action, 'unstick')
  assert.equal(p.guidance, 1) // the reply rides along so later workers get it as context
})

test('collectPRs honours the maxReviewRounds config knob', async () => {
  // A mergeable, green PR whose head is unreviewed but already carries one review
  // round: with the default bound (2) it gets another review; with a config bound of
  // 1 it is past the cap and surfaced for triage (LLP 0017).
  const exec = fakeWorld({
    prs: [{ number: 1, headRefName: 'integration/auth' }],
    views: {
      1: {
        number: 1, headRefName: 'integration/auth', baseRefName: 'main', isDraft: true,
        mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [],
        headRefOid: 'ccccccc', body: 'context\n<!-- neutral-review: aaaaaaa -->'
      }
    }
  })
  const repo = mkdtempSync(join(tmpdir(), 'neutral-prs-'))
  try {
    // No config -> default bound of 2: one prior round is under the cap, so review.
    assert.equal((await collectPRs(repo, exec))[0].action, 'review')
    // Bound of 1: the prior round meets the cap, so triage.
    mkdirSync(join(repo, '.neutral'))
    writeFileSync(join(repo, '.neutral', 'config.json'), JSON.stringify({ maxReviewRounds: 1 }))
    assert.equal((await collectPRs(repo, exec))[0].action, 'triage')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('collectPRs scopes an autophagy/ head as own, but exempts it from automerge (LLP 0036)', async () => {
  // Two reviewed-clean terminal PRs in an automerge repo: the integration PR merges
  // (LLP 0019); the autophagy cleanup proposal stays held for a human.
  /** @param {number} number @param {string} head */
  const view = (number, head) => ({
    number, headRefName: head, baseRefName: 'main', isDraft: false,
    mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [],
    headRefOid: 'abc1234', body: '<!-- neutral-review: abc1234 -->'
  })
  const exec = fakeWorld({
    prs: [
      { number: 1, headRefName: 'integration/auth' },
      { number: 2, headRefName: 'autophagy/cleanup-2026-07-27' }
    ],
    views: { 1: view(1, 'integration/auth'), 2: view(2, 'autophagy/cleanup-2026-07-27') }
  })
  const repo = mkdtempSync(join(tmpdir(), 'neutral-prs-'))
  try {
    mkdirSync(join(repo, '.neutral'))
    writeFileSync(join(repo, '.neutral', 'config.json'), JSON.stringify({ automerge: true, shipRisk: { mode: 'off' } }))
    const got = await collectPRs(repo, exec)
    assert.deepEqual(got.map(p => [p.number, p.foreign, p.action]), [
      [1, false, 'merge'],
      [2, false, 'held']
    ])
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('collectIssues classifies each neutral:fix issue from ground truth', async () => {
  const exec = fakeWorld({
    issues: [
      { number: 9, title: 'has a branch', labels: [{ name: 'neutral:fix' }] },
      { number: 10, title: 'has a fixes PR', labels: [{ name: 'neutral:fix' }] },
      { number: 11, title: 'stuck', labels: [{ name: 'neutral:fix' }, { name: 'neutral:stuck' }] },
      { number: 12, title: 'fresh', labels: [{ name: 'neutral:fix' }] }
    ],
    fixBranches: ['fix/issue-9'],
    prs: [{ number: 30, headRefName: 'fix/issue-10', body: 'Fixes #10' }]
  })
  const got = await collectIssues('/r', exec)
  assert.deepEqual(got.map(i => [i.number, i.state]), [
    [9, 'attempt-exists'],
    [10, 'attempt-exists'],
    [11, 'stuck'],
    [12, 'needs-fix']
  ])
})

test('collectIssues is empty when no issues carry the label', async () => {
  assert.deepEqual(await collectIssues('/r', fakeWorld({ issues: [] })), [])
})
