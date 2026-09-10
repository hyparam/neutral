// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deferFindings } from '../src/commands/defer-findings.js'

const sha = 'a'.repeat(40)
const preference = { ordinal: 1, disposition: 'defer', kind: 'preference', severity: 'minor', title: 'Longer name',
  location: 'a.js:1', evidence: 'Helper name is abbreviated', acceptance: 'Rename helper', reason: 'Behavior unchanged' }
const defect = { ...preference, ordinal: 2, kind: 'defect', expectedBehavior: 'Return an empty list for empty input' }

// @ref LLP 0075#follow-ups [tests] — exercise the actual GitHub controller, including partial retry and stale-head abort
test('only evidenced defects receive the automatic repair label at issue creation', async () => {
  /** @type {string[][]} */
  const creates = []
  const result = await deferFindings('/repo', 4, sha, [preference, defect], async (cmd, args) => {
    if (args[0] === 'pr') return JSON.stringify({ headRefOid: sha, state: 'OPEN' })
    if (args[0] === 'api') return '[[]]'
    creates.push(args)
    const body = readFileSync(args[args.indexOf('--body-file') + 1], 'utf8')
    assert.match(body, /Acceptance condition/)
    return `https://github.com/a/b/issues/${creates.length}`
  })
  assert.equal(creates[0].includes('--label'), false)
  assert.deepEqual(creates[1].slice(-2), ['--label', 'neutral:fix'])
  assert.deepEqual(result.map(r => r.number), [1, 2])
})

test('partial retries reuse finding issues across all states without changing human labels', async () => {
  let creates = 0
  const result = await deferFindings('/repo', 4, sha, [preference, defect], async (cmd, args) => {
    if (args[0] === 'pr') return JSON.stringify({ headRefOid: sha, state: 'OPEN' })
    if (args[0] === 'api') return JSON.stringify([[{ number: 9, body: `<!-- neutral-deferred-finding: pr#4 ${sha} finding:1 -->`, state: 'closed' }]])
    creates++
    return 'https://github.com/a/b/issues/10'
  })
  assert.equal(creates, 1)
  assert.deepEqual(result.map(r => r.number), [9, 10])
})

test('a changed head or malformed finding prevents creating issues', async () => {
  let writes = 0
  await assert.rejects(deferFindings('/repo', 4, sha, [preference], async (cmd, args) => {
    if (args[0] === 'pr') return JSON.stringify({ headRefOid: 'b'.repeat(40), state: 'OPEN' })
    writes++
    return ''
  }), /head changed/)
  await assert.rejects(deferFindings('/repo', 4, sha, [preference, { ...defect, acceptance: '' }], async () => {
    writes++
    return ''
  }), /acceptance/)
  assert.equal(writes, 0)
})
