// @ts-check
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from '../src/config.js'
import { codeLineStats, isProductionCodePath, parseCodeNumstat } from '../src/commands/pr-stats.js'

// @ref LLP 0070#body [tests] — stats include configured source and exclude tests + LLPs
test('parseCodeNumstat counts production source only', () => {
  const stats = parseCodeNumstat([
    '10\t2\tsrc/app.js',
    '4\t1\tbin/neutral.js',
    '2\t1\tsrc/{old.js => current.js}',
    '100\t50\ttest/app.test.js',
    '20\t3\tsrc/app.spec.js',
    '8\t8\tpackages/x/__tests__/app.ts',
    '7\t2\tllp/0070-description.spec.md',
    '12\t4\tREADME.md',
    '-\t-\tsrc/logo.png'
  ].join('\n'))
  assert.deepEqual(stats, { additions: 16, deletions: 4 })
})

test('isProductionCodePath honors custom source extensions and LLP directory', () => {
  const config = {
    ...DEFAULT_CONFIG,
    llpDir: 'docs/decisions',
    code: { ...DEFAULT_CONFIG.code, exts: ['.js', '.json'] }
  }
  assert.equal(isProductionCodePath('src/app.js', config), true)
  assert.equal(isProductionCodePath('config/runtime.json', config), true)
  assert.equal(isProductionCodePath('docs/decisions/0001-a.md', config), false)
  assert.equal(isProductionCodePath('src/tests/helper.js', config), false)
  assert.equal(isProductionCodePath('src/helper.test.json', config), false)
})

test('codeLineStats asks git for the GitHub-style final-head diff', async () => {
  /** @type {Array<{cmd: string, args: string[], cwd: string}>} */
  const calls = []
  /** @type {import('../src/git.js').run} */
  const exec = async (cmd, args, cwd) => {
    calls.push({ cmd, args, cwd })
    return '3\t1\tsrc/app.js\n9\t2\ttests/app.js\n'
  }
  assert.deepEqual(
    await codeLineStats('/repo', 'origin/main', 'feature-head', exec, DEFAULT_CONFIG),
    { additions: 3, deletions: 1 }
  )
  assert.deepEqual(calls, [{
    cmd: 'git',
    args: ['diff', '--find-renames', '--numstat', 'origin/main...feature-head', '--'],
    cwd: '/repo'
  }])
})
