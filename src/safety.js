// @ts-check
// @ref LLP 0072#budget [implements] — one recovery, then hold; no I/O or model dependency
/** @import { SafetyState, SafetyAction, SafetyClock } from './safety-types.d.ts' */

export const SAFETY_POLICY = Object.freeze({ version: 1, hourMs: 3_600_000, dayMs: 86_400_000,
  failuresHour: 2, failuresDay: 6, startsHour: 4, startsDay: 24 })

/** @param {string} deployment @param {string} id @param {SafetyClock} clock @returns {SafetyState} */
export function initialSafetyState(deployment, id, clock) {
  return { version: 1, deployment, epoch: id, clock, incarnation: null, registry: '',
    hold: { id, reason: 'initialized: operator rearm required', at: clock.wall },
    lastHold: null, rearmedAt: null, failures: [], starts: [] }
}

/** @param {SafetyState} state @param {SafetyClock} now */
export function safetyCounts(state, now) {
  return {
    failuresHour: state.failures.filter(e => now.mono - e.at <= SAFETY_POLICY.hourMs).length,
    failuresDay: state.failures.length,
    starts: Object.fromEntries([...new Set(state.starts.map(e => e.loop))].map(loop => [loop, {
      hour: state.starts.filter(e => e.loop === loop && now.mono - e.at <= SAFETY_POLICY.hourMs).length,
      day: state.starts.filter(e => e.loop === loop).length
    }]))
  }
}

/**
 * A launch reservation is never refunded. A hold is authorization state, not a
 * claim about work completed. Callers persist the result before acting on it.
 * @ref LLP 0072#persistence [implements] — unclean incarnation and clocks fail closed
 * @param {SafetyState} previous @param {SafetyAction} action @param {SafetyClock} now
 * @returns {SafetyState}
 */
export function safetyStep(previous, action, now) {
  const state = structuredClone(previous)
  const hold = (/** @type {string} */ reason) => {
    state.hold ??= { id: action.id, reason, at: now.wall }
    return state
  }
  if (action.kind === 'rearm') {
    if (!state.hold || action.incident !== state.hold.id || !action.reason?.trim()) throw new Error('exact incident and reason required')
    return { ...state, epoch: action.id, clock: now, incarnation: action.id,
      registry: action.registry ?? state.registry, lastHold: state.hold, hold: null,
      rearmedAt: now.wall, failures: [], starts: [] }
  }
  if (state.hold) return state
  if (now.boot !== state.clock.boot || now.mono < state.clock.mono ||
      Math.abs((now.wall - state.clock.wall) - (now.mono - state.clock.mono)) > 60_000) {
    return hold('clock continuity lost')
  }
  state.clock = now
  state.failures = state.failures.filter(e => now.mono - e.at <= SAFETY_POLICY.dayMs)
  state.starts = state.starts.filter(e => now.mono - e.at <= SAFETY_POLICY.dayMs)
  if (action.kind === 'begin') {
    if (state.incarnation) return hold('unclean controller termination')
    if (state.registry !== action.registry) return hold('fleet configuration changed')
    state.incarnation = action.id
  } else if (action.kind === 'failure') {
    if (!state.failures.some(e => e.id === action.id)) state.failures.push({ id: action.id, at: now.mono })
    const counts = safetyCounts(state, now)
    if (counts.failuresHour >= SAFETY_POLICY.failuresHour) return hold('second failure within 60 minutes')
    if (counts.failuresDay >= SAFETY_POLICY.failuresDay) return hold('sixth failure within 24 hours')
  } else if (action.kind === 'reserve') {
    const loops = action.loops ?? []
    if (!loops.length || new Set(loops).size !== loops.length) throw new Error('distinct registered loops required')
    if (state.starts.some(e => e.id === action.id)) return state
    const counts = safetyCounts(state, now)
    for (const loop of loops) {
      if ((counts.starts[loop]?.hour ?? 0) >= SAFETY_POLICY.startsHour) return hold(`hourly start ceiling: ${loop}`)
      if ((counts.starts[loop]?.day ?? 0) >= SAFETY_POLICY.startsDay) return hold(`daily start ceiling: ${loop}`)
    }
    state.starts.push(...loops.map(loop => ({ id: action.id, loop, at: now.mono })))
  } else if (action.kind === 'hold') return hold(action.reason ?? 'operator hold')
  else if (action.kind === 'stop') state.incarnation = null
  return state
}
