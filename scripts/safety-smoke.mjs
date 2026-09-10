// Isolated Docker acceptance test. Uses fake services and its own disposable
// volumes/containers; never supplies credentials or calls a model provider.
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const run = `neutral-safety-smoke-${Date.now()}`
const output = mkdtempSync(join(tmpdir(), `${run}-`))
const safety = `${run}-state`
const work = `${run}-work`
const image = process.env.NEUTRAL_SAFETY_TEST_IMAGE || 'neutral-safety-test:local'
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }).trim()
const exec = (...args) => docker('exec', run, ...args)
const status = () => JSON.parse(exec('neutral', 'safety', 'status', '--json'))
const root = (...args) => JSON.parse(exec('neutral', 'safety', ...args))
const events = []
function mark(step) {
  const event = { timestamp: new Date().toISOString(), dev_run_id: run, event_type: 'smoke_assertion', step, status: 'ok' }
  events.push(event)
  console.log(JSON.stringify(event))
  writeFileSync(join(output, 'smoke.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n')
}
async function until(predicate, timeout = 150_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try { if (predicate()) return } catch { /* startup or restart in progress */ }
    await delay(1000)
  }
  throw new Error('smoke deadline exceeded')
}
function start() {
  docker('run', '-d', '--name', run, '--restart', 'always', '--label', `neutral-safety-smoke=${run}`,
    '-e', `DEV_RUN_ID=${run}`, '-v', `${safety}:/var/lib/neutral-safety`, '-v', `${work}:/work`, image)
}
const modelStarts = () => JSON.parse(exec('node', '-e', "const f=require('fs'); console.log(JSON.stringify(f.existsSync('/work/model-starts.jsonl')?f.readFileSync('/work/model-starts.jsonl','utf8').trim().split('\\n').map(JSON.parse):[]))"))
const workers = () => exec('node', '-e', "const f=require('fs'); console.log(JSON.stringify(Object.fromEntries(f.readdirSync('/work').filter(p=>p.startsWith('worker-')).map(p=>[p,f.readFileSync('/work/'+p,'utf8')]))))")
try {
  docker('run', '--rm', '--entrypoint', 'node', image, '/opt/neutral/docker/test-fixtures/safety/probe.js')
  mark('process-owned-gateway-only')
  docker('volume', 'create', safety)
  docker('volume', 'create', work)
  // A fresh volume needs the same ownership as the production /work volume.
  docker('run', '--rm', '--entrypoint', 'sh', '-v', `${work}:/work`, image, '-c', 'chown neutral:neutral /work')
  start()
  await until(() => status().held)
  assert.equal(modelStarts().length, 0)
  const empty = status()
  assert.throws(() => docker('exec', '--user', 'neutral', run, 'neutral', 'safety', 'init', '--incident', empty.hold.id, '--deployment', 'smoke', '--reason', 'unauthorized'))
  assert.throws(() => docker('exec', '--user', 'neutral', run, 'sh', '-c', 'echo bad > /var/lib/neutral-safety/state.json'))
  mark('missing-state-held-and-operator-boundary')
  const initialized = root('init', '--incident', empty.hold.id, '--deployment', 'smoke', '--reason', 'isolated test')
  assert(initialized.held)
  root('rearm', '--incident', initialized.hold.id, '--reason', 'first fake fleet boot')
  await until(() => modelStarts().length === 1)
  assert.equal(exec('id', '-u'), '0')
  assert.equal(exec('node', '-e', "console.log(require('fs').readFileSync('/proc/1/comm','utf8').trim())"), 'node')
  mark('operator-rearm-launches-after-stable-gateway')
  let before = status()
  exec('kill', '-9', String(before.processes.find(p => p.role === 'hyp').pid))
  await until(() => modelStarts().length === 2)
  assert.equal(status().counts.failuresHour, 1)
  assert.notEqual(status().loops[0].run, before.loops[0].run)
  mark('first-failure-recovers-once')
  before = status()
  exec('kill', '-9', String(before.processes.find(p => p.role === 'hyp').pid))
  await until(() => status().held)
  await until(() => Number(docker('inspect', '--format', '{{.RestartCount}}', run)) >= 1)
  assert.equal(modelStarts().length, 2)
  assert.match(status().hold.reason, /second failure/)
  const stoppedWorkers = workers()
  await delay(1500)
  assert.equal(workers(), stoppedWorkers)
  assert(Object.keys(JSON.parse(stoppedWorkers)).length >= 2)
  mark('second-failure-kills-detached-workers-and-reboots-held')
  const incident = status().hold.id
  docker('rm', '-f', run)
  start()
  await until(() => status().held)
  assert.equal(status().hold.id, incident)
  assert.equal(modelStarts().length, 2)
  assert.throws(() => root('rearm', '--incident', 'stale', '--reason', 'test stale reset'))
  mark('hold-survives-container-recreation')
  writeFileSync(join(output, 'controller-events.jsonl'), exec('cat', '/var/lib/neutral-safety/events.jsonl') + '\n')
  const audit = exec('cat', '/var/lib/neutral-safety/events.jsonl').split('\n').map(JSON.parse)
  assert.equal(audit.filter(e => e.event_type === 'failure').length, 2)
  assert(audit.some(e => e.reason === 'second failure within 60 minutes'))
  mark('durable-audit-matches-observed-launches')
  console.log(`Smoke evidence: ${output}`)
} finally {
  try { writeFileSync(join(output, 'container.log'), docker('logs', '--tail', '100', run)) } catch {}
  try { writeFileSync(join(output, 'last-status.json'), JSON.stringify(status(), null, 2)) } catch {}
  try { writeFileSync(join(output, 'gateway-pane.txt'), docker('exec', '--user', 'neutral', run, 'tmux', 'capture-pane', '-p', '-t', '=hyp-daemon:')) } catch {}
  try { docker('rm', '-f', run) } catch {}
  // These two names were created above for this run only, never user data volumes.
  for (const volume of [safety, work]) {
    try { docker('volume', 'rm', volume) } catch {}
  }
}
