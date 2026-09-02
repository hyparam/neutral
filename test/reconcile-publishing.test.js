// @ts-check
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reconcile = readFileSync(join(root, '.claude/skills/neutral-reconcile/SKILL.md'), 'utf8')
const workflow = readFileSync(join(root, '.claude/skills/neutral-reconcile/implement-changeset.workflow.js'), 'utf8')
const publishing = readFileSync(join(root, '.claude/skills/neutral-reconcile/references/pr-publishing.md'), 'utf8')

// @ref LLP 0070#publish [tests] — every PR-producing path reaches one procedure
test('all Neutral PR producers route through the shared publishing procedure', () => {
  assert.match(reconcile, /new task, change-set, issue-fix, or autophagy PR/)
  assert.match(reconcile, /references\/pr-publishing\.md/)
  assert.match(workflow, /references\/pr-publishing\.md/)
  assert.match(workflow, /Skill tool with \\`unslop\\`/)
  assert.match(workflow, /origin\/\$\{integration\}/)
})

test('publishing uses cleanup, final checks, derived stats, then a body file', () => {
  const cleanup = publishing.indexOf('Skill tool with `unslop`')
  const checks = publishing.indexOf("Run the repository's tests")
  const stats = publishing.indexOf('neutral pr-stats')
  const create = publishing.indexOf('create the PR with `--body-file`')
  assert.ok(cleanup >= 0 && cleanup < checks)
  assert.ok(checks < stats && stats < create)
  assert.match(publishing, /## Feature or issue/)
  assert.match(publishing, /## Solution/)
  assert.match(publishing, /\*\*Code:\*\* \+A \/ -D lines/)
  assert.doesNotMatch(publishing, /## Test plan/i)
})

test('unslop is bundled for the headless loop and protects functional annotations', () => {
  const skillPath = join(root, '.claude/skills/unslop/SKILL.md')
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
  assert.equal(existsSync(skillPath), true)
  const skill = readFileSync(skillPath, 'utf8')
  assert.match(skill, /^---\nname: unslop\n/m)
  assert.match(skill, /Preserve functional comments and annotations such as `@ref`/)
  assert.match(dockerfile, /\.claude\/skills\/unslop \/home\/neutral\/\.claude\/skills\/unslop/)
})

// @ref LLP 0071#triage-fan-out [tests] — deferred review work fans out at finding granularity and retries by stable identity
test('triage creates one detailed, idempotent issue per deferred finding', () => {
  const triage = reconcile.slice(reconcile.indexOf('- **`triage`**'), reconcile.indexOf('- **`assess-ship-risk`**'))

  assert.match(triage, /\*\*one issue per finding\*\*/)
  assert.match(triage, /neutral-deferred-finding: pr#N <the head SHA> finding:<ordinal>/)
  assert.match(triage, /source PR and head, severity, file:line or symbol, observed evidence and behavior/)
  assert.match(triage, /acceptance condition/)
  assert.match(triage, /finding → issue link/)
  assert.match(triage, /neutral-triage: <the head SHA> #M #N \.\.\./)
  assert.doesNotMatch(triage, /Follow-up: deferred review findings/)
})

// @ref LLP 0071#fix-pr [tests] — issue-fix preserves the one-finding scope and carries concrete detail into the PR
test('issue-fix creates one specifically titled and detailed PR per issue', () => {
  const issueFix = reconcile.slice(reconcile.indexOf('## Fan-out worker: Issue-fix'), reconcile.indexOf('## Fan-in:'))

  assert.match(issueFix, /fetch the issue title and full body/)
  assert.match(issueFix, /Fix #N: <issue title>/)
  assert.match(issueFix, /concrete problem and evidence/)
  assert.match(issueFix, /actual fix and verification/)
  assert.match(issueFix, /sole closing trailer/)
  assert.match(issueFix, /Do not fold sibling deferred findings/)
  assert.match(publishing, /One issue-fix PR has one\s+closing issue/)
})
