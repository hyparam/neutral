// @ts-check
// Linux regression: same-uid /proc ownership checks work without CAP_SYS_PTRACE
// and reject a reachable socket belonging to another daemon generation.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { SafetyPlatform, safetyClock, fleetConfig } from '../../safety-platform.js'
import { SafetyController } from '../../safety-controller.js'
import { SafetyStore } from '../../safety-store.js'

mkdirSync('/run/neutral-safety/permits', { recursive: true })
const platform = new SafetyPlatform(process.env)
await platform.prepare()
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
