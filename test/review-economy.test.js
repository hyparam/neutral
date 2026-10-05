// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { selectRung } from '../src/prhealth.js'
import { planDeferredFindings } from '../src/findings.js'
import { waitHook } from '../src/worker-wait.js'

const pr = {
  number: 1, head: 'fix/issue-1', base: 'main', headSha: 'abcdef1234567890',
  body: '', labels: [], isDraft: true, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', rollup: [],
  comments: [{ body: '<!-- neutral-review: abcdef1234567890 findings -->\n1. prose preference', author: 'phil', createdAt: '1' }]
}

// @ref LLP 0075#disposition [tests] — unchanged findings need adjudication, changed code still needs review
test('unchanged reviewed findings route to triage before the cap without approving the head', () => {
  const result = selectRung(pr)
  assert.equal(result.action, 'triage')
  assert.equal(result.approved, undefined)
  assert.equal(result.canFix, true)
  assert.equal(selectRung(pr, 1).canFix, false)
  assert.match(result.reason, /unchanged/)
  assert.equal(selectRung({ ...pr, headSha: 'bbbbbbb' }).action, 'review')
  assert.equal(selectRung({ ...pr, rollup: [{ status: 'IN_PROGRESS' }] }).action, 'wait')
  assert.equal(selectRung({ ...pr, comments: [] }).action, 'review')
})

test('the latest review controls early disposition; stale findings cannot replace a new review', () => {
  const comments = [...pr.comments, { ...pr.comments[0], body: '<!-- neutral-review: bbbbbbb findings -->' }]
  assert.equal(selectRung({ ...pr, comments }, 3).action, 'review')
  assert.equal(selectRung({ ...pr, foreign: true }).action, 'review')
})

// @ref LLP 0078#baseline [tests] — changed heads carry the latest observed baseline without granting approval
test('re-review exposes the latest clean or findings record, while the first review has no baseline', () => {
  const first = selectRung({ ...pr, comments: [] })
  assert.equal(first.action, 'review')
  assert.equal(first.previousReviewSha, undefined)
  for (const verdict of ['clean', 'findings']) {
    const result = selectRung({ ...pr, headSha: 'ccccccc', comments: [
      ...pr.comments,
      { ...pr.comments[0], body: `<!-- neutral-review: bbbbbbb ${verdict} -->` }
    ] }, 3)
    assert.equal(result.action, 'review')
    assert.equal(result.previousReviewSha, 'bbbbbbb')
    assert.equal(result.approved, undefined)
  }
  const legacy = selectRung({ ...pr, body: '<!-- neutral-review: aaaaaaa -->', comments: [] })
  assert.equal(legacy.previousReviewSha, 'aaaaaaa')
})

test('incremental scope does not bypass unchanged findings, CI, the round cap or foreign-review boundaries', () => {
  const changed = { ...pr, headSha: 'bbbbbbb' }
  for (const result of [
    selectRung(pr),
    selectRung(changed, 1),
    selectRung({ ...changed, rollup: [{ status: 'IN_PROGRESS' }] }),
    selectRung({ ...changed, foreign: true })
  ]) assert.equal(result.previousReviewSha, undefined)
  assert.equal(selectRung(pr).action, 'triage')
  assert.equal(selectRung(changed, 1).action, 'triage')
  assert.equal(selectRung({ ...changed, rollup: [{ status: 'IN_PROGRESS' }] }).action, 'wait')
  const grant = { ...pr.comments[0], body: 'neutral: rounds +1' }
  assert.equal(selectRung({ ...changed, comments: [...pr.comments, grant] }, 1).previousReviewSha, pr.headSha)
})

const preference = { ordinal: 1, disposition: 'defer', kind: 'preference', severity: 'minor', title: 'Rename local helper',
  location: 'src/a.js:9', evidence: 'The current name is abbrevi­ated.', reason: 'No behavior changes.',
  acceptance: 'Use the longer descriptive name.' }
const defect = { ...preference, ordinal: 2, kind: 'defect', title: 'Handle empty input',
  evidence: 'Calling parse([]) throws TypeError.', expectedBehavior: 'An empty input returns [].',
  acceptance: 'A regression test fails before the fix and passes after it.' }

// @ref LLP 0075#follow-ups [tests] — only evidenced defects become automatic work
test('preferences stay backlog, evidenced defects receive neutral:fix, rejected findings create no issue', () => {
  const plan = planDeferredFindings(17, 'abcdef1234567890', [preference, defect,
    { ...preference, ordinal: 3, disposition: 'reject', reason: 'The cited path is unreachable, proven by the caller guard.' }])
  assert.equal(plan.length, 2)
  assert.deepEqual(plan[0].labels, [])
  assert.deepEqual(plan[1].labels, ['neutral:fix'])
  assert.match(plan[0].body, /neutral-deferred-finding: pr#17 abcdef1234567890 finding:1/)
  assert.match(plan[1].body, /Expected behavior/)
})

test('incomplete defect evidence and unresolved work fail closed before any issue is created', () => {
  for (const invalid of [
    { ...defect, expectedBehavior: '' }, { ...defect, acceptance: '' },
    { ...defect, evidence: '' }, { ...defect, disposition: 'blocker' },
    { ...defect, disposition: 'fix' }, { ...defect, kind: 'nit' },
    { ...defect, ordinal: 1 }, { ...defect, ordinal: 3 }
  ]) assert.throws(() => planDeferredFindings(17, 'abcdef1234567890', [preference, invalid]))
  assert.throws(() => planDeferredFindings(17, 'abcdef1234567890', [{ ...preference, disposition: 'reject', reason: '' }]))
})

// @ref LLP 0075#waiting [tests] — force completion waits instead of model-driven polling
test('TaskOutput polling becomes a bounded blocking wait without granting tool permission', () => {
  const result = waitHook({ tool_name: 'TaskOutput', tool_input: { task_id: 'a1', block: false, timeout: 1 } })
  assert.deepEqual(result?.hookSpecificOutput.updatedInput, { task_id: 'a1', block: true, timeout: 600000 })
  assert.equal(result?.hookSpecificOutput.permissionDecision, undefined)
})

test('numbered waiting echoes are denied while actual commands and redirected writes are preserved', () => {
  for (let i = 1; i <= 20; i++) {
    assert.equal(waitHook({ tool_name: 'Bash', tool_input: { command: `echo "waiting for reviewer ${i}"` } })?.hookSpecificOutput.permissionDecision, 'deny')
  }
  for (const command of ['git status', 'echo waiting > status.txt', 'echo "waiting $(git status)"', 'echo waiting; ps aux', 'echo "pending" | cat']) {
    assert.equal(waitHook({ tool_name: 'Bash', tool_input: { command } }), null)
  }
})

// @ref LLP 0077#waiting [tests] — replay the actual compound command and synthetic waits
test('worker hook blocks cross-task cleanup and background sleep accumulation', () => {
  for (const command of [
    'for t in bvy77nuht bodymqd46; do pkill -f "sleep" >/dev/null 2>&1; done',
    '/usr/bin/pkill -f sleep', 'env pkill -u neutral', 'killall node',
    'sleep 580; echo tick', 'while true; do stat transcript.jsonl; sleep 30; done'
  ]) {
    assert.equal(waitHook({ tool_name: 'Bash', tool_input: { command, run_in_background: true } })?.hookSpecificOutput.permissionDecision, 'deny', command)
  }
  assert.equal(waitHook({ tool_name: 'Monitor', tool_input: { command: 'pkill -f sleep' } })?.hookSpecificOutput.permissionDecision, 'deny')
  for (const input of [
    { tool_name: 'TaskStop', tool_input: { task_id: 'owned-task' } },
    { tool_name: 'Bash', tool_input: { command: 'npm test', run_in_background: true } },
    { tool_name: 'Monitor', tool_input: { command: 'until curl -fsS localhost:8080; do sleep 2; done' } }
  ]) assert.equal(waitHook(input), null)
})
