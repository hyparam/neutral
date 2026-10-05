// @ts-check
// Linux regression: same-uid /proc ownership checks work without CAP_SYS_PTRACE
// and reject a reachable socket belonging to another daemon generation.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { SafetyPlatform, safetyClock, fleetConfig } from '../../safety-platform.js'
import { SafetyController } from '../../safety-controller.js'
import { SafetyStore } from '../../safety-store.js'

mkdirSync('/run/neutral-safety/permits', { recursive: true })
mkdirSync('/run/neutral-safety/tmux', { mode: 0o700 })
const platform = new SafetyPlatform(process.env)
await platform.prepare()
writeFileSync('/home/neutral/.tmux.conf', 'run-shell "id -u > /work/tmux-config-loaded"\n')
const first = await platform.launch({ id: 'hyp', session: 'hyp-daemon', cwd: '/work', command: 'hyp daemon run --foreground' }, undefined)
await delay(200)
const firstPort = Number(readFileSync('/work/fake-port', 'utf8'))
await platform.attach()
assert.equal(await platform.gateway(first), firstPort)
const second = await platform.launch({ id: 'other', session: 'other-daemon', cwd: '/work', command: 'hyp daemon run --foreground' }, undefined)
await delay(200)
await platform.attach()
assert.notEqual(await platform.gateway(second), null)
assert.equal(await platform.gateway(first), null)
writeFileSync('/work/fake-port', String(firstPort))
const controller = new SafetyController({ platform, store: new SafetyStore('/var/lib/neutral-safety'),
  config: fleetConfig(process.env), clock: safetyClock, stableMs: 50, readinessMs: 5000,
  exit: () => { assert.fail('unexpected exit') } })
controller.runs.set('hyp', first)
assert.equal(await controller.readyGateway(), true)
console.log('same-user ownership, stale attachment rejection, and stable readiness verified')

// @ref LLP 0077#supervisor [tests] — the real incident's broad match cannot signal the shared root server
const serverPid = Number(await platform.tmux(['display-message', '-p', '#{pid}']))
assert.match(readFileSync(`/proc/${serverPid}/status`, 'utf8'), /Uid:\s+0\s+0/)
assert.match(readFileSync(`/proc/${first.pid}/status`, 'utf8'), /Uid:\s+(?!0\b)\d+/)
await assert.rejects(platform.asNeutral('kill', ['-TERM', String(serverPid)]), /permitted/)
await assert.rejects(platform.asNeutral('/usr/bin/tmux', ['-S', '/run/neutral-safety/tmux/server.sock', 'new-session', '-d', 'id']), /denied/)
// Replay the vulnerable launch alongside the fixed server. Both have sleep in
// the server argv; only the neutral-owned baseline should die from this signal.
await platform.asNeutral('/usr/bin/tmux', ['-f', '/dev/null', '-L', 'incident-baseline', 'new-session', '-d', '-s', 'baseline',
  'sleep 0.05; exec node -e "setInterval(() => {}, 1000)"'])
await delay(100)
const baselinePid = Number(await platform.asNeutral('/usr/bin/tmux', ['-L', 'incident-baseline', 'display-message', '-p', '#{pid}']))
assert.match(readFileSync(`/proc/${baselinePid}/cmdline`, 'utf8'), /sleep/)
assert.match(readFileSync(`/proc/${serverPid}/cmdline`, 'utf8'), /sleep/)
// Invoke only inside this disposable fake-service container, never production.
await platform.asNeutral('pkill', ['-f', 'sleep']).catch(() => {})
await delay(100)
await assert.rejects(platform.asNeutral('/usr/bin/tmux', ['-L', 'incident-baseline', 'list-sessions']))
assert.equal(existsSync('/work/tmux-config-loaded'), false)
assert.equal((await platform.observe(first)).alive, true)
assert.equal((await platform.observe(second)).alive, true)
assert((await platform.capture(first)).includes('fake gateway ready'))
console.log('worker signals and direct socket access cannot reach the shared supervisor')
