export interface SafetyClock { boot: string; mono: number; wall: number }
export interface SafetyHold { id: string; reason: string; at: number }
export interface SafetyFailure { id: string; at: number }
export interface SafetyStart { id: string; loop: string; at: number }
export interface SafetyState {
  version: 1
  deployment: string
  epoch: string
  clock: SafetyClock
  incarnation: string | null
  registry: string
  hold: SafetyHold | null
  lastHold: SafetyHold | null
  rearmedAt: number | null
  failures: SafetyFailure[]
  starts: SafetyStart[]
}
export interface SafetyAction {
  kind: 'begin' | 'observe' | 'failure' | 'reserve' | 'hold' | 'rearm' | 'stop'
  id: string
  reason?: string
  registry?: string
  incident?: string
  loops?: string[]
  evidence?: Record<string, string | number | null>
}
