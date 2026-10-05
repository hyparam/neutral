// @ts-check
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { tmuxStartArgv, startCommand, sessionName, LOOP_SHELL_COMMAND } from '../src/commands/start.js'

// @ref LLP 0020#decision [tests] — Agent accepts aliases; its Fable binding must reach child processes
test('launcher exports the judgment model binding to Claude and its workers', () => {
  const script = `claude() { sh -c 'printf "%s" "$ANTHROPIC_DEFAULT_FABLE_MODEL"'; }; ${LOOP_SHELL_COMMAND}`
  const output = execFileSync('sh', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH } })
  assert.equal(output, 'claude-fable-5-1')
})

test('tmuxStartArgv: idempotent attach-or-create, detached when nested', () => {
  assert.deepEqual(tmuxStartArgv({ session: 'neutral-x' }), ['new-session', '-A', '-s', 'neutral-x', LOOP_SHELL_COMMAND])
  assert.deepEqual(tmuxStartArgv({ session: 'neutral-x', nested: true }), ['new-session', '-d', '-A', '-s', 'neutral-x', LOOP_SHELL_COMMAND])
  // the loop command runs via sh -c, with the orchestrator pinned to the 1M-context
  // Opus (LLP 0020); the model token is single-quoted so sh doesn't glob `[1m]`
  assert.equal(LOOP_SHELL_COMMAND, "ANTHROPIC_DEFAULT_FABLE_MODEL=claude-fable-5-1 claude --model 'opus[1m]' --dangerously-skip-permissions '/loop /neutral-reconcile'")
})

test('sessionName: per-repo `neutral-<folder>`, sanitized, with a bare fallback (LLP 0014)', () => {
  assert.equal(sessionName('/Users/phil/workspace/hypaware'), 'neutral-hypaware')
  assert.equal(sessionName('/Users/phil/workspace/neutral'), 'neutral-neutral')
  assert.equal(sessionName('/srv/my.app:2'), 'neutral-my-app-2')  // tmux-unsafe chars collapse to `-`
  assert.equal(sessionName('/'), 'neutral')                       // empty folder → bare prefix
  assert.equal(sessionName(''), 'neutral')
})

test('startCommand: tmux missing → fallback message, exit 1, never spawns', async () => {
  let spawned = false
  const code = await startCommand('/r', [], {
    exec: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
    spawn: () => { spawned = true; return { status: 0 } },
    env: {}
  })
  assert.equal(code, 1)
  assert.equal(spawned, false)
})

test('startCommand: plain terminal → hands argv to an interactive spawn, returns its status', async () => {
  /** @type {string[]|null} */
  let got = null
  const code = await startCommand('/repos/hypaware', [], {
    exec: async () => '',                       // tmux -V ok
    spawn: (_cmd, a) => { got = a; return { status: 0 } },
    env: {}                                      // not nested
  })
  assert.equal(code, 0)
  assert.deepEqual(got, ['new-session', '-A', '-s', 'neutral-hypaware', LOOP_SHELL_COMMAND])
})

test('startCommand: inside tmux → ensures a detached session, never attaches interactively', async () => {
  /** @type {string[]|null} */
  let execArgv = null
  let spawned = false
  const code = await startCommand('/repos/hypaware', [], {
    exec: async (_cmd, a) => { if (a[0] === 'new-session') execArgv = a; return '' },
    spawn: () => { spawned = true; return { status: 0 } },
    env: { TMUX: '/tmp/tmux-501/default,123,0' }  // already inside tmux
  })
  assert.equal(code, 0)
  assert.equal(spawned, false)
  assert.deepEqual(execArgv, ['new-session', '-d', '-A', '-s', 'neutral-hypaware', LOOP_SHELL_COMMAND])
})

// @ref LLP 0072#controller [tests] — unmanaged CLI startup cannot bypass container admission
test('startCommand refuses unmanaged starts in a guarded container', async () => {
  let called = false
  const code = await startCommand('/work/a', [], {
    env: { NEUTRAL_SAFETY_SOCKET: '/run/neutral-safety/client.sock' },
    exec: async () => { called = true; return '' },
    spawn: () => { called = true; return { status: 0 } }
  })
  assert.equal(code, 1)
  assert.equal(called, false)
})
