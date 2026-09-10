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
