// @ts-check
import { readFileSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

/** @import { SafetyState } from '../src/safety-types.d.ts' */
const digest = (/** @type {string} */ text) => createHash('sha256').update(text).digest('hex')

/** Reject partial/corrupt checkpoints, including plausible but malformed histories.
 * @param {unknown} value @returns {value is SafetyState}
 */
export function validSafetyState(value) {
  const s = /** @type {SafetyState|undefined} */ (value)
  const str = (/** @type {unknown} */ x) => typeof x === 'string' && x.length > 0 && x.length <= 1024
  const num = (/** @type {unknown} */ x) => typeof x === 'number' && Number.isFinite(x) && x >= 0
  const hold = (/** @type {SafetyState['hold']} */ h) => h === null || (!!h && str(h.id) && str(h.reason) && num(h.at))
  return !!s && s.version === 1 && str(s.deployment) && str(s.epoch) &&
    !!s.clock && str(s.clock.boot) && num(s.clock.mono) && num(s.clock.wall) &&
    (s.incarnation === null || str(s.incarnation)) && typeof s.registry === 'string' &&
    hold(s.hold) && hold(s.lastHold) && (s.rearmedAt === null || num(s.rearmedAt)) &&
    Array.isArray(s.failures) && s.failures.length <= 6 && s.failures.every(e => str(e.id) && num(e.at) && e.at <= s.clock.mono) &&
    Array.isArray(s.starts) && s.starts.length <= 24 * 100 && s.starts.every(e => str(e.id) && str(e.loop) && num(e.at) && e.at <= s.clock.mono)
}

// @ref LLP 0072#persistence [implements] — atomic checkpoint + bounded synced audit, owned by PID 1
export class SafetyStore {
  /** @param {string} dir */
  constructor(dir) { this.dir = dir }
  load() {
    const { payload, sha256 } = JSON.parse(readFileSync(join(this.dir, 'state.json'), 'utf8'))
    if (typeof payload !== 'string' || digest(payload) !== sha256) throw new Error('invalid safety checksum')
    const state = JSON.parse(payload)
    if (!validSafetyState(state)) throw new Error('invalid safety state')
    return state
  }
  /** @param {SafetyState} state @param {string} event @param {string} [reason] @param {Record<string, string | number | null>} [evidence] */
  save(state, event, reason = '', evidence = {}) {
    if (!validSafetyState(state)) throw new Error('refusing invalid safety state')
    const audit = join(this.dir, 'events.jsonl')
    if (existsSync(audit) && statSync(audit).size > 2 * 1024 * 1024) renameSync(audit, join(this.dir, 'events.previous.jsonl'))
    const fd = openSync(audit, 'a', 0o600)
    try {
      writeFileSync(fd, JSON.stringify({ timestamp: new Date().toISOString(), event_type: event,
        dev_run_id: process.env.DEV_RUN_ID ?? null, epoch: state.epoch,
        incident: state.hold?.id ?? null, reason: state.hold?.reason ?? reason,
        failures: state.failures.length, starts: state.starts.length, evidence }) + '\n')
      fsyncSync(fd)
    } finally { closeSync(fd) }
    const payload = JSON.stringify(state)
    const temp = join(this.dir, 'state.next')
    const next = openSync(temp, 'w', 0o600)
    try {
      writeFileSync(next, JSON.stringify({ payload, sha256: digest(payload) }) + '\n')
      fsyncSync(next)
    }
    finally { closeSync(next) }
    renameSync(temp, join(this.dir, 'state.json'))
    const directory = openSync(this.dir, 'r')
    try { fsyncSync(directory) } finally { closeSync(directory) }
  }
}
