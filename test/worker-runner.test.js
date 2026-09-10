// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { runWorker } from '../src/commands/run-worker.js'
import { installWorkerHooks } from '../docker/install-worker-hooks.js'

const exec = promisify(execFile)
const cli = fileURLToPath(new URL('../bin/neutral.js', import.meta.url))

// @ref LLP 0075#waiting [tests] — a slow real child generates one result, no interim model-visible wait events
test('runner emits only after completion, preserving exit and output', async () => {
  const child = spawn(process.execPath, [cli, 'run-worker', '--timeout-ms', '3000', '--', process.execPath,
    '-e', 'console.log("start"); setTimeout(() => { console.log("complete"); process.exit(3) }, 150)'])
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  const code = await new Promise(resolve => child.on('close', resolve))
  assert.equal(code, 3)
  assert.equal(output.trim().split('\n').length, 1)
  const result = JSON.parse(output)
  assert.equal(result.stdout, 'start\ncomplete\n')
  assert.equal(result.timedOut, false)
})

test('runner kills a timed-out process group and exposes timeout instead of success', async () => {
  const result = await runWorker([process.execPath, '-e', 'console.log(process.pid); setInterval(() => {}, 1000)'], 250)
  assert.equal(result.exitCode, 124)
  assert.equal(result.timedOut, true)
  const pid = Number(result.stdout.trim())
  assert.ok(pid > 0)
  assert.throws(() => process.kill(pid, 0))
})

test('runner reports missing executables and bounds large outputs visibly', async () => {
  assert.equal((await runWorker(['/nonexistent/neutral-worker'], 1000)).exitCode, 127)
  const result = await runWorker([process.execPath, '-e', 'console.log("x".repeat(20000))'], 1000)
  assert.equal(result.stdout.length, 16000)
  assert.equal(result.truncated, true)
})

test('hook executable returns the documented blocking input update', async () => {
  const hook = fileURLToPath(new URL('../docker/worker-wait-hook.js', import.meta.url))
  const child = exec(process.execPath, [hook])
  child.child.stdin?.end(JSON.stringify({ tool_name: 'TaskOutput', tool_input: { task_id: 'review', block: false } }))
  const result = JSON.parse((await child).stdout)
  assert.equal(result.hookSpecificOutput.updatedInput.block, true)
  assert.equal(result.hookSpecificOutput.updatedInput.task_id, 'review')
})

test('hook installation is idempotent and preserves capture settings and unrelated hooks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'neutral-hooks-'))
  try {
    const path = join(dir, 'settings.json')
    const old = { matcher: 'Read', hooks: [{ type: 'command', command: 'other-hook' }] }
    writeFileSync(path, JSON.stringify({ _hypaware: { port: 12345 }, hooks: { PreToolUse: [old], Stop: [] } }))
    installWorkerHooks(dir)
    installWorkerHooks(dir)
    const result = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(result._hypaware.port, 12345)
    assert.deepEqual(result.hooks.PreToolUse[0], old)
    assert.equal(result.hooks.PreToolUse.length, 2)
    assert.deepEqual(result.hooks.Stop, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
