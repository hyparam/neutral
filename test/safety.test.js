// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { initialSafetyState, safetyStep, SAFETY_POLICY } from '../src/safety.js'
import { SafetyStore, validSafetyState } from '../docker/safety-store.js'
import { SafetyPlatform, fleetConfig } from '../docker/safety-platform.js'
import { SafetyController, serveSafety, prepareSafetyRuntime } from '../docker/safety-controller.js'
import { safetyRequest } from '../src/safety-client.js'

/** @import { TestContext } from 'node:test' */
/** @import { setTimeout as Delay } from 'node:timers/promises' */
/** @import { SafetyState, SafetyAction, SafetyClock } from '../src/safety-types.d.ts' */
/** @import { LoopDefinition, ProcessRun } from '../docker/safety-types.d.ts' */
const hour = SAFETY_POLICY.hourMs
const base = { boot: 'host-boot', mono: 100_000, wall: 1_800_000_000_000 }
const at = (/** @type {number} */ elapsed) => ({ ...base, mono: base.mono + elapsed, wall: base.wall + elapsed })
/** @returns {SafetyState} */
function active() {
  return safetyStep(initialSafetyState('test', 'incident', base),
    { kind: 'rearm', id: 'epoch', incident: 'incident', reason: 'test', registry: 'fleet' }, base)
}
/** @param {SafetyState} state @param {SafetyAction['kind']} kind @param {number} elapsed @param {Partial<SafetyAction>} [more] */
const step = (state, kind, elapsed, more = {}) => safetyStep(state, { kind, id: randomUUID(), ...more }, at(elapsed))

// @ref LLP 0072#validation [tests] — inclusive rolling limits, successful work cannot forgive failures
test('first failure allows recovery, second holds even across a wall-clock hour boundary', () => {
  const one = step(active(), 'failure', 0, { id: 'daemon-1' })
  assert.equal(one.hold, null)
  const work = step(one, 'reserve', 1000, { loops: ['a', 'b', 'c', 'watchdog', 'mayor'] })
  assert.equal(work.starts.length, 5)
  const two = step(work, 'failure', 10 * 60_000)
  assert.match(two.hold?.reason ?? '', /second failure/)
  assert.equal(step(two, 'reserve', 11 * 60_000, { loops: ['a'] }).starts.length, 5)
  assert.equal(step(two, 'observe', 48 * hour).hold?.id, two.hold?.id)
})

test('hour boundary is inclusive; outside it the daily limit still applies', () => {
  const first = step(active(), 'failure', 0)
  assert(step(first, 'failure', hour).hold)
  assert.equal(step(first, 'failure', hour + 1).hold, null)
  let state = active()
  for (let i = 0; i < 6; i++) {
    state = step(state, 'failure', i * 2 * hour)
    assert.equal(!!state.hold, i === 5)
  }
  assert.match(state.hold?.reason ?? '', /sixth failure/)
})

test('polling an old exit is deduplicated; a new process dying is another event', () => {
  const one = step(active(), 'failure', 0, { id: 'run-1' })
  const poll = step(one, 'failure', 5000, { id: 'run-1' })
  assert.equal(poll.failures.length, 1)
  assert(step(poll, 'failure', 6000, { id: 'run-2' }).hold)
})

test('whole-wave reservation is atomic, replay-safe, and never refunded', () => {
  let state = active()
  for (let i = 0; i < 4; i++) state = step(state, 'reserve', i, { loops: ['a'], id: `start-${i}` })
  assert.equal(step(state, 'reserve', 5, { loops: ['a'], id: 'start-3' }).starts.length, 4)
  const denied = step(state, 'reserve', 6, { loops: ['b', 'a'] })
  assert(denied.hold)
  assert(!denied.starts.some(e => e.loop === 'b'))
  assert.throws(() => step(active(), 'reserve', 0, { loops: ['a', 'a'] }))
})

test('daily start ceiling covers legitimate-looking slow recycling', () => {
  let state = active()
  for (let i = 0; i < 24; i++) {
    state = step(state, 'reserve', i * 30 * 60_000, { loops: ['a'] })
    assert.equal(state.hold, null)
  }
  assert.match(step(state, 'reserve', 12 * hour, { loops: ['a'] }).hold?.reason ?? '', /daily start/)
})

test('planned stop preserves budgets; unclean restart and configuration change hold', () => {
  const state = step(active(), 'failure', 0)
  assert.match(step(state, 'begin', 1, { registry: 'fleet' }).hold?.reason ?? '', /unclean/)
  const stopped = step(state, 'stop', 1)
  const restarted = step(stopped, 'begin', 2, { registry: 'fleet' })
  assert.equal(restarted.hold, null)
  assert.equal(restarted.failures.length, 1)
  assert.match(step(stopped, 'begin', 2, { registry: 'different' }).hold?.reason ?? '', /configuration/)
})

test('host reboot, monotonic regression, and forward/backward wall jumps hold', () => {
  for (const now of [{ ...at(1), boot: 'other' }, { ...base, mono: base.mono - 1 },
    { ...at(1), wall: base.wall + 2 * hour }, { ...at(1), wall: base.wall - 2 * hour }]) {
    assert.match(safetyStep(active(), { kind: 'observe', id: 'clock-error' }, now).hold?.reason ?? '', /clock/)
  }
})

test('only exact operator rearm clears the hold and records an allowance epoch', () => {
  const held = step(active(), 'hold', 0, { reason: 'test incident' })
  assert.throws(() => step(held, 'rearm', 1, { incident: 'stale', reason: 'test' }))
  assert.throws(() => step(held, 'rearm', 1, { incident: held.hold?.id }))
  const fresh = step(held, 'rearm', 1, { incident: held.hold?.id, reason: 'operator fixed cause' })
  assert.equal(fresh.hold, null)
  assert.equal(fresh.lastHold?.id, held.hold?.id)
  assert.notEqual(fresh.epoch, held.epoch)
})

test('checkpoint detects corruption and audit records the independently observed sequence', t => {
  const dir = mkdtempSync(join(tmpdir(), 'neutral-safety-store-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SafetyStore(dir)
  store.save(active(), 'rearm')
  const state = step(store.load(), 'failure', 0)
  store.save(state, 'failure')
  assert.equal(store.load().failures.length, 1)
  assert.deepEqual(readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l).event_type), ['rearm', 'failure'])
  assert(!validSafetyState({ ...active(), failures: [{ id: 'future', at: base.mono + 1 }] }))
  writeFileSync(join(dir, 'state.json'), '{"payload":"{}","sha256":"bad"}')
  assert.throws(() => store.load(), /checksum/)
})

class FakePlatform extends SafetyPlatform {
  constructor() { super({}) }
  /** @type {Map<string, boolean>} */
  live = new Map()
  /** @type {ProcessRun[]} */
  launched = []
  gatewayOK = true
  modelAbsent = true
  failLaunch = false
  async prepare() {}
  async attach() {}
  hasHypConfig() { return true }
  async modelProcessesAbsent() { return this.modelAbsent }
  /** @param {LoopDefinition} def @param {ProcessRun|undefined} old */
  async launch(def, old) {
    if (this.failLaunch) throw new Error('simulated launch failure')
    if (old) this.live.set(old.run, false)
    const run = { ...def, run: randomUUID(), pid: this.launched.length + 100, identity: 'start-time' }
    this.live.set(run.run, true)
    this.launched.push(run)
    return run
  }
  /** @param {ProcessRun} run */
  async observe(run) { return { exists: true, alive: this.live.get(run.run) === true, exit: this.live.get(run.run) ? null : 137 } }
  async gateway() { return this.gatewayOK ? 12345 : null }
}

/** @param {TestContext} t @param {boolean} [hyp] */
function fixture(t, hyp = false) {
  const dir = mkdtempSync(join(tmpdir(), 'neutral-safety-controller-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const config = fleetConfig({ NEUTRAL_REPOS: 'owner/a owner/b owner/c', NEUTRAL_HYPAWARE: hyp ? '1' : '0', NEUTRAL_MAYOR: '1',
    SLACK_BOT_TOKEN: 'fake', SLACK_APP_TOKEN: 'fake', SLACK_CHANNEL_ID: 'fake', SLACK_ALLOWED_USER_IDS: 'fake' })
  config.sentinel = false
  const platform = new FakePlatform()
  const store = new SafetyStore(dir)
  let clock = { ...base }
  const state = safetyStep(initialSafetyState('test', 'initial', clock),
    { kind: 'rearm', id: 'first-epoch', incident: 'initial', reason: 'test', registry: config.registry }, clock)
  store.save(safetyStep(state, { kind: 'stop', id: 'planned' }, clock), 'stop')
  /** @type {number[]} */
  const exits = []
  const deps = { store, config, platform, clock: () => clock, exit: (/** @type {number} */ code) => { exits.push(code) },
    stableMs: 0, readinessMs: 5000, sleep: /** @type {typeof Delay} */ (async () => {
      clock = { ...clock, mono: clock.mono + 1000, wall: clock.wall + 1000 }
    }) }
  const controller = new SafetyController(deps)
  return { controller, deps, exits, platform, store, dir }
}

test('controller coalesces five-loop gateway wave and stops before second recovery', async t => {
  const f = fixture(t, true)
  await f.controller.boot()
  assert.equal(f.controller.state?.starts.length, 5)
  const first = f.controller.runs.get('hyp')
  assert(first)
  f.platform.live.set(first.run, false)
  await f.controller.tick()
  assert.equal(f.controller.state?.failures.length, 1)
  assert.equal(f.controller.state?.starts.length, 10)
  const second = f.controller.runs.get('hyp')
  assert(second)
  f.platform.live.set(second.run, false)
  const launched = f.platform.launched.length
  await f.controller.tick()
  assert.equal(f.platform.launched.length, launched)
  assert.deepEqual(f.exits, [75])
  assert.match(f.store.load().hold?.reason ?? '', /second failure/)
  const rebuilt = new SafetyController(f.deps)
  await rebuilt.boot()
  assert(rebuilt.status().held)
  assert.equal(f.platform.launched.slice(launched).filter(r => r.id !== 'hyp').length, 0)
})

test('concurrent requests for the same generation cannot launch two successors', async t => {
  const f = fixture(t)
  await f.controller.boot()
  const run = f.controller.runs.get('repo:owner/a')
  assert(run)
  const request = { action: 'replace', session: run.session, run: run.run }
  const results = await Promise.allSettled([1, 2].map(() => f.controller.serial(() => f.controller.request(request, false))))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(f.controller.state?.failures.length, 1)
  assert.equal(f.platform.launched.filter(r => r.id === run.id).length, 2)
  await assert.rejects(() => f.controller.request({ action: 'rearm', incident: 'any', reason: 'agent' }, false), /operator socket/)
})

test('gateway readiness timeout launches no models', async t => {
  const f = fixture(t, true)
  f.platform.gatewayOK = false
  await f.controller.boot()
  assert(f.controller.state?.hold)
  assert.equal(f.platform.launched.filter(r => r.id.startsWith('repo:')).length, 0)
  assert.deepEqual(f.exits, [75])
})

test('a successful probe completing after the readiness deadline cannot admit models', async t => {
  const f = fixture(t, true)
  f.platform.gateway = async () => {
    for (let i = 0; i < 6; i++) await f.deps.sleep(1000)
    return 12345
  }
  await f.controller.boot()
  assert.match(f.controller.state?.hold?.reason ?? '', /deadline/)
  assert.equal(f.platform.launched.filter(r => r.id.startsWith('repo:')).length, 0)
})

test('Slack delivery failure cannot prevent the durable stop', async t => {
  const f = fixture(t)
  const controller = new SafetyController({ ...f.deps, notify: async () => { throw new Error('Slack unavailable') } })
  await controller.boot()
  await controller.trip('test notification outage')
  assert.deepEqual(f.exits, [75])
  assert.equal(f.store.load().hold?.reason, 'test notification outage')
})

test('a replacement daemon dying before readiness trips without another attempt', async t => {
  const f = fixture(t, true)
  f.platform.observe = async () => ({ exists: true, alive: false, exit: 137 })
  await f.controller.boot()
  assert.equal(f.controller.state?.failures.length, 2)
  assert.equal(f.platform.launched.filter(r => r.id === 'hyp').length, 2)
  assert.equal(f.platform.launched.filter(r => r.id.startsWith('repo:')).length, 0)
  assert.deepEqual(f.exits, [75])
})

test('missing safety mount cannot be initialized into the disposable layer', async t => {
  const f = fixture(t)
  const controller = new SafetyController({ ...f.deps, storageMounted: false })
  await controller.boot()
  assert.match(controller.status().hold?.reason ?? '', /not mounted/)
  await assert.rejects(() => controller.request({ action: 'init', incident: controller.invalid.id, deployment: 'test', reason: 'try' }, true), /mount persistent/)
  assert.equal(f.platform.launched.length, 0)
})

test('held rearm requires absence of surviving model processes', async t => {
  const f = fixture(t)
  await f.controller.boot()
  await f.controller.trip('test')
  const held = new SafetyController(f.deps)
  await held.boot()
  f.platform.modelAbsent = false
  await assert.rejects(() => held.request({ action: 'rearm', incident: held.state?.hold?.id, reason: 'test' }, true), /model processes remain/)
  assert(held.status().held)
})

test('lost state and unclean controller exit fail closed on boot', async t => {
  const f = fixture(t)
  await f.controller.boot()
  const another = new SafetyController(f.deps)
  const prior = f.platform.launched.length
  await another.boot()
  assert.match(another.state?.hold?.reason ?? '', /unclean/)
  assert.equal(f.platform.launched.length, prior)
  rmSync(join(f.dir, 'state.json'))
  const missing = new SafetyController(f.deps)
  await missing.boot()
  assert(missing.status().held)
  assert.equal(f.platform.launched.length, prior)
})

test('failed persistence exits before launch and leaves an unclean incarnation', async t => {
  const f = fixture(t)
  await f.controller.boot()
  const current = f.controller.runs.get('repo:owner/a')
  assert(current)
  const prior = f.platform.launched.length
  // A directory where the atomic replacement file should be simulates I/O failure.
  mkdirSync(join(f.dir, 'state.next'))
  await assert.rejects(() => f.controller.request({ action: 'recycle', session: current.session, run: current.run }, false))
  assert.deepEqual(f.exits, [75])
  assert.equal(f.platform.launched.length, prior)
  assert(f.store.load().incarnation)
})

test('launch failure after reservation terminates, rather than leaving a half-started wave', async t => {
  const f = fixture(t)
  await f.controller.boot()
  f.platform.failLaunch = true
  const current = f.controller.runs.get('repo:owner/a')
  assert(current)
  await assert.rejects(() => f.controller.request({ action: 'recycle', session: current.session, run: current.run }, false))
  assert.deepEqual(f.exits, [75])
  assert.match(f.store.load().hold?.reason ?? '', /launch failed/)
})

test('Unix client protocol reports status and refuses operator operations on client socket', async t => {
  const f = fixture(t)
  const socket = join(f.dir, 'client.sock')
  const server = serveSafety(f.controller, socket, false)
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => server.close())
  assert((await safetyRequest({ action: 'status' }, { socket })).held)
  await assert.rejects(() => safetyRequest({ action: 'init', deployment: 'test', reason: 'attempt' }, { socket }), /operator socket/)
})

test('boot removes stale runtime socket paths and permits while preserving persistent state', async t => {
  const f = fixture(t)
  const runtime = join(f.dir, 'runtime')
  mkdirSync(runtime)
  writeFileSync(join(runtime, 'client.sock'), 'stale socket inode')
  writeFileSync(join(runtime, 'old-permit'), '')
  prepareSafetyRuntime(runtime)
  const server = serveSafety(f.controller, join(runtime, 'client.sock'), false)
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => server.close())
  assert((await safetyRequest({ action: 'status' }, { socket: join(runtime, 'client.sock') })).held)
  assert.equal(f.store.load().deployment, 'test')
})

test('fleet configuration rejects naming collisions and preserves model overrides safely', () => {
  assert.throws(() => fleetConfig({ NEUTRAL_REPOS: 'one/a two/a' }), /duplicate/)
  assert.throws(() => fleetConfig({ NEUTRAL_REPOS: 'owner/watchdog' }), /reserved/)
  assert.throws(() => fleetConfig({ NEUTRAL_REPOS: 'owner/..' }), /invalid/)
  const cfg = fleetConfig({ NEUTRAL_REPOS: 'owner/a', NEUTRAL_MODEL: "model'with-quote" })
  assert(cfg.loops[0].command.includes("'model'\\''with-quote'"))
  assert(cfg.loops[0].command.includes('/loop /neutral-reconcile'))
})
