// @ts-check
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { chmodSync, mkdirSync, readFileSync, existsSync, rmSync, readlinkSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { initialSafetyState, safetyStep, safetyCounts, SAFETY_POLICY } from '../src/safety.js'
import { SafetyStore } from './safety-store.js'
import { SafetyPlatform, fleetConfig, safetyClock, SAFETY_DIR, RUNTIME_DIR } from './safety-platform.js'
import { reportSafety } from './outage-sentinel.js'

/** @import { SafetyState, SafetyAction } from '../src/safety-types.d.ts' */
/** @import { LoopDefinition, ProcessRun, SafetyRequest } from './safety-types.d.ts' */
const daemon = { id: 'hyp', session: 'hyp-daemon', cwd: '/work', command: 'hyp daemon run --foreground' }
const sentinel = { id: 'sentinel', session: 'outage-sentinel', cwd: '/work', command: 'node /opt/neutral/docker/outage-sentinel.js' }
const bridge = { id: 'bridge', session: 'slack-bridge', cwd: '/work', command: 'node /opt/neutral/docker/slack-bridge.js' }

// @ref LLP 0072#controller [implements] — one serialized admission owner; all adapters injected in tests
export class SafetyController {
  /** @param {{ store: SafetyStore, platform: SafetyPlatform, config: ReturnType<typeof fleetConfig>, clock: typeof safetyClock,
   * exit: (code: number) => void, notify?: (status: any) => Promise<unknown>, sleep?: typeof delay, stableMs?: number, readinessMs?: number, storageMounted?: boolean }} deps */
  constructor(deps) {
    this.deps = deps
    /** @type {SafetyState|null} */
    this.state = null
    this.invalid = { id: randomUUID(), reason: 'uninitialized or invalid safety state', at: deps.clock().wall }
    if (deps.storageMounted === false) this.invalid.reason = 'persistent safety volume is not mounted'
    /** @type {Map<string, ProcessRun>} */
    this.runs = new Map()
    this.closing = false
    this.prepared = false
    this.diagHypAttempted = false
    this.queue = Promise.resolve()
  }
  /** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
  serial(fn) {
    const work = this.queue.then(fn)
    this.queue = work.then(() => {}, () => {})
    return work
  }
  status() {
    return { held: !this.state || !!this.state.hold, hold: this.state?.hold ?? (!this.state ? this.invalid : null),
      lastHold: this.state?.lastHold ?? null, rearmedAt: this.state?.rearmedAt ?? null,
      policy: SAFETY_POLICY, deployment: this.state?.deployment ?? null,
      counts: this.state ? safetyCounts(this.state, this.state.clock) : null,
      countsObservedAt: this.state?.clock.wall ?? null,
      loops: this.deps.config.loops.map(l => ({ id: l.id, session: l.session, run: this.runs.get(l.id)?.run ?? null })),
      processes: [...this.runs.values()].map(r => ({ role: r.id, pid: r.pid, identity: r.identity, run: r.run })) }
  }
  /** @param {SafetyAction} action */
  commit(action) {
    if (!this.state) throw new Error('safety state unavailable')
    const next = safetyStep(this.state, action, this.deps.clock())
    try { this.deps.store.save(next, action.kind, action.reason, action.evidence) }
    catch (err) {
      this.closing = true
      console.error('[neutral-safety] durable write failed; terminating container')
      this.deps.exit(75)
      throw err
    }
    this.state = next
    console.log(JSON.stringify({ component: 'neutral-safety', event_type: action.kind,
      operation: action.id, incident: next.hold?.id ?? null, reason: next.hold?.reason ?? null }))
    return !next.hold
  }
  async enforce() {
    if (!this.state?.hold || this.closing) return
    this.closing = true
    await Promise.race([this.deps.notify?.(this.status()).catch(() => {}), delay(5000, undefined, { ref: false })])
    this.deps.exit(75)
  }
  /** @param {string} reason */
  async trip(reason) {
    this.commit({ kind: 'hold', id: randomUUID(), reason })
    await this.enforce()
  }
  /** @param {LoopDefinition} definition */
  async launch(definition) {
    if (this.closing) throw new Error('controller stopping')
    try {
      const run = await this.deps.platform.launch(definition, this.runs.get(definition.id))
      this.runs.set(definition.id, run)
      if (this.state) this.deps.store.save(this.state, 'process_start', '', { role: run.id, run: run.run, pid: run.pid, identity: run.identity })
      return run
    } catch (err) {
      if (this.state && !this.state.hold) await this.trip('process launch failed')
      throw err
    }
  }
  /** @param {ProcessRun} run */
  async failure(run) {
    const obs = await this.deps.platform.observe(run)
    console.log(JSON.stringify({ component: 'neutral-safety', event_type: 'process_exit', run: run.run,
      role: run.id, pid: run.pid, identity: run.identity, exit_status: obs.exit, signal: null }))
    if (!this.commit({ kind: 'failure', id: run.run,
      evidence: { role: run.id, run: run.run, pid: run.pid, identity: run.identity, exit_status: obs.exit, signal: null } })) {
      await this.enforce()
      return false
    }
    return true
  }
  /** @param {LoopDefinition[]} definitions */
  async reserve(definitions) {
    if (!this.commit({ kind: 'reserve', id: randomUUID(), loops: definitions.map(d => d.id) })) {
      await this.enforce()
      return false
    }
    return true
  }
  /** Readiness observes daemon process ownership, not just an HTTP response. */
  async readyGateway() {
    if (!this.deps.config.hyp) return true
    const clock = this.deps.clock
    const deadline = clock().mono + (this.deps.readinessMs ?? 120_000)
    let stableAt = clock().mono
    let lastPort = null
    while (clock().mono < deadline && !this.closing) {
      const run = this.runs.get('hyp')
      if (!run) throw new Error('gateway not launched')
      if (!(await this.deps.platform.observe(run)).alive) {
        // A daemon dying before readiness is still a new observed failure.
        if (!this.state?.hold && await this.failure(run)) await this.launch(daemon)
        else return false
        lastPort = null
        stableAt = clock().mono
      } else {
        if (lastPort === null) await this.deps.platform.attach()
        const port = await this.deps.platform.gateway(run)
        if (port === null || port !== lastPort) stableAt = clock().mono
        lastPort = port
        if (clock().mono >= deadline) break
        if (port !== null && clock().mono - stableAt >= (this.deps.stableMs ?? 60_000)) return true
      }
      await (this.deps.sleep ?? delay)(1000)
    }
    if (this.state && !this.state.hold) await this.trip('gateway readiness deadline exceeded')
    return false
  }
  async prepare() {
    if (!this.prepared) {
      await this.deps.platform.prepare()
      this.prepared = true
    }
  }
  async startFleet(gatewayReady = false) {
    if (!this.state || this.state.hold || this.closing) return
    await this.prepare()
    if (!await this.reserve(this.deps.config.loops)) return
    if (this.deps.config.hyp && !this.runs.has('hyp')) await this.launch(daemon)
    if (!gatewayReady && !await this.readyGateway()) return
    for (const definition of this.deps.config.loops) await this.launch(definition)
    if (this.deps.config.mayor) await this.launch(bridge)
  }
  async boot() {
    if (this.deps.storageMounted !== false) {
      try { this.state = this.deps.store.load() } catch { /* held until explicit operator initialization/repair */ }
    }
    if (this.state && !this.state.hold) this.commit({ kind: 'begin', id: randomUUID(), registry: this.deps.config.registry })
    if (this.status().held) await this.diagnostics()
    else await this.startFleet()
  }
  async diagnostics() {
    // Deliberately one diagnostic gateway attempt per held incarnation.
    if (this.deps.config.hyp && !this.diagHypAttempted && this.deps.platform.hasHypConfig()) {
      this.diagHypAttempted = true
      await this.launch(daemon).catch(() => {})
    }
    const old = this.runs.get('sentinel')
    if (this.deps.config.sentinel && (!old || !(await this.deps.platform.observe(old)).alive)) await this.launch(sentinel)
  }
  async tick() {
    if (this.closing) return
    if (this.status().held) {
      await this.diagnostics()
      return
    }
    // Observe time each pass without syncing a no-op checkpoint every second.
    // Every admission persists this clock before its external side effect.
    if (!this.state) return
    const observation = { kind: /** @type {const} */ ('observe'), id: randomUUID() }
    const observed = safetyStep(this.state, observation, this.deps.clock())
    if (observed.hold) {
      this.commit(observation)
      await this.enforce()
      return
    }
    this.state = observed
    const hyp = this.runs.get('hyp')
    if (hyp && !(await this.deps.platform.observe(hyp)).alive) {
      if (!await this.failure(hyp) || !await this.reserve(this.deps.config.loops)) return
      await this.launch(daemon)
      if (!await this.readyGateway()) return
      // Independent deaths are not forgiven by a successful gateway recovery.
      for (const def of this.deps.config.loops) {
        const old = this.runs.get(def.id)
        if (old && !(await this.deps.platform.observe(old)).alive && !await this.failure(old)) return
      }
      for (const def of this.deps.config.loops) await this.launch(def)
    } else {
      for (const def of this.deps.config.loops) {
        const old = this.runs.get(def.id)
        if (old && !(await this.deps.platform.observe(old)).alive) {
          if (!await this.failure(old) || !await this.reserve([def])) return
          await this.launch(def)
        }
      }
    }
    for (const def of [sentinel, ...(this.deps.config.mayor ? [bridge] : [])]) {
      if (def.id === 'sentinel' && !this.deps.config.sentinel) continue
      const old = this.runs.get(def.id)
      if (!old || !(await this.deps.platform.observe(old)).alive) await this.launch(def)
    }
  }
  /** @param {SafetyRequest} request @param {boolean} operator */
  async request(request, operator) {
    if (request.action === 'status') return this.status()
    // @ref LLP 0077#supervisor [implements] — fixed pane operations, no caller-provided tmux arguments
    if (request.action === 'sessions') return this.deps.platform.sessions()
    if (request.action === 'capture' || request.action === 'send') {
      const run = [...this.runs.values()].find(r => r.session === request.session)
      if (!run || !(await this.deps.platform.observe(run)).alive) throw new Error('unknown or dead session')
      if (request.action === 'capture') return this.deps.platform.capture(run)
      if (this.closing || !this.state || this.state.hold) throw new Error('fleet held: pane input refused')
      if (!this.deps.config.loops.some(l => l.session === run.session) || run.run !== request.run) throw new Error('unknown or stale loop generation')
      if (typeof request.message !== 'string' || !request.message.trim() || request.message.length > 16000 || /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(request.message)) throw new Error('plain message required (maximum 16000 characters)')
      return { submitted: await this.deps.platform.send(run, request.message) }
    }
    if (this.closing) throw new Error('controller stopping')
    if (['init', 'rearm', 'stop'].includes(request.action)) {
      if (!operator) throw new Error('operator socket required')
      if (!request.reason?.trim() || request.reason.length > 512) throw new Error('operator reason required (maximum 512 characters)')
      if (request.action === 'init') {
        if (this.deps.storageMounted === false) throw new Error('mount persistent safety volume before initialization')
        if (this.state || request.incident !== this.invalid.id || !/^[A-Za-z0-9_-]{1,80}$/.test(request.deployment ?? '')) throw new Error('exact invalid-state incident and deployment required; initialized state cannot be reset')
        if (existsSync(`${this.deps.store.dir}/state.json`)) throw new Error('corrupt checkpoint requires operator archival before init')
        this.state = initialSafetyState(/** @type {string} */ (request.deployment), randomUUID(), this.deps.clock())
        this.deps.store.save(this.state, 'init', request.reason)
      } else if (request.action === 'rearm') {
        if (!this.state?.hold || request.incident !== this.state.hold.id) throw new Error('exact current incident required')
        if (!await this.deps.platform.modelProcessesAbsent()) throw new Error('model processes remain; restart diagnostics first')
        await this.prepare()
        if (this.deps.config.hyp) {
          const hyp = this.runs.get('hyp')
          if (!hyp || !(await this.deps.platform.observe(hyp)).alive) await this.launch(daemon)
          if (!await this.readyGateway()) throw new Error('gateway not ready; hold retained')
        }
        this.commit({ kind: 'rearm', id: randomUUID(), incident: request.incident, reason: request.reason, registry: this.deps.config.registry })
        await this.startFleet(true)
      } else {
        if (!this.state || this.state.hold) throw new Error('fleet already held; ordinary Docker stop preserves hold')
        this.commit({ kind: 'stop', id: randomUUID(), reason: request.reason })
        this.closing = true
        this.deps.exit(0)
      }
      return this.status()
    }
    if (!['replace', 'recycle'].includes(request.action)) throw new Error('unknown safety operation')
    if (!this.state || this.state.hold) throw new Error('fleet held: operator rearm required')
    const def = this.deps.config.loops.find(d => d.session === request.session)
    const old = def && this.runs.get(def.id)
    if (!def || !old || old.run !== request.run) throw new Error('unknown or stale loop generation; operation not replayed')
    if (request.action === 'replace' || !(await this.deps.platform.observe(old)).alive) {
      if (!await this.failure(old)) return this.status()
    }
    if (await this.reserve([def])) await this.launch(def)
    return this.status()
  }
}

/** @param {SafetyController} controller @param {string} path @param {boolean} operator */
export function serveSafety(controller, path, operator) {
  const server = createServer(socket => {
    socket.setTimeout(150_000, () => socket.destroy())
    let input = ''
    let handled = false
    socket.on('error', () => {})
    socket.on('data', data => {
      if (handled) return
      input += data.toString()
      if (input.length > 100000) {
        socket.destroy()
        return
      }
      if (!input.includes('\n')) return
      handled = true
      let request
      try { request = JSON.parse(input.slice(0, input.indexOf('\n'))) } catch {
        socket.end('{"ok":false,"error":"invalid request"}\n')
        return
      }
      if (!request || typeof request !== 'object' || typeof request.action !== 'string') {
        socket.end('{"ok":false,"error":"invalid request"}\n')
        return
      }
      // Read-only status must remain available while a bounded readiness check runs.
      const result = request.action === 'status' ? Promise.resolve(controller.status()) : controller.serial(() => controller.request(request, operator))
      result.then(value => socket.end(JSON.stringify({ ok: true, value }) + '\n'), err => socket.end(JSON.stringify({ ok: false, error: String(err.message) }) + '\n'))
    })
  })
  server.listen(path, () => chmodSync(path, operator ? 0o600 : 0o666))
  return server
}

/**
 * Docker restart preserves the writable layer, including dead Unix sockets.
 * Called only by the root controller after entrypoint's exclusive persistent lock, before
 * starting any service. Never remove the persistent state directory here.
 * @ref LLP 0072#validation [implements] — diagnostics must survive Docker restart, not only recreation
 * @param {string} [dir]
 */
export function prepareSafetyRuntime(dir = RUNTIME_DIR) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(`${dir}/permits`, { recursive: true, mode: 0o755 })
  mkdirSync(`${dir}/tmux`, { mode: 0o700 })
}

async function main() {
  // @ref LLP 0076#init [implements] - refuse an unmanaged controller whose exit cannot end the namespace
  if (process.getuid?.() !== 0 || process.ppid !== 1 || readlinkSync('/proc/1/exe') !== '/usr/bin/tini') {
    throw new Error('safety controller must run as the direct root child of the bundled tini PID 1')
  }
  // No fallback to the disposable container layer: a missing mount is held.
  const mounted = readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some(l => l.split(' ')[4] === SAFETY_DIR)
  prepareSafetyRuntime()
  const controller = new SafetyController({ store: new SafetyStore(SAFETY_DIR), platform: new SafetyPlatform(process.env),
    config: fleetConfig(process.env), clock: safetyClock, storageMounted: mounted,
    exit: code => { setTimeout(() => process.exit(code), 100) }, notify: status => reportSafety(status, process.env) })
  serveSafety(controller, `${RUNTIME_DIR}/client.sock`, false)
  serveSafety(controller, `${RUNTIME_DIR}/operator.sock`, true)
  process.on('SIGTERM', () => { void controller.serial(() => controller.trip('unprepared container stop')) })
  process.on('SIGINT', () => { void controller.serial(() => controller.trip('unprepared container stop')) })
  await controller.serial(() => controller.boot())
  for (;;) {
    await delay(1000)
    await controller.serial(() => controller.tick())
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('[neutral-safety] controller failed; terminating without clearing incarnation')
    process.exit(75)
  })
}
