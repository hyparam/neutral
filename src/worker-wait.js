// @ts-check

/** @import { WaitHookInput, WaitHookResult } from './types.d.ts' */

// @ref LLP 0075#waiting [implements] — the harness blocks; an echo is never an observation
/** @param {WaitHookInput} input @returns {WaitHookResult|null} */
export function waitHook(input) {
  if (input.tool_name === 'TaskOutput') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse',
      updatedInput: { ...input.tool_input, block: true, timeout: 600000 } } }
  }
  const command = input.tool_input?.command
  if (input.tool_name !== 'Bash' || typeof command !== 'string') return null
  // Limit the guard to literal standalone output, preserving writes and real probes.
  if (/[\n\r;|&<>`$\\]/.test(command)) return null
  if (!/^\s*(?:echo|printf)\s+/.test(command)) return null
  if (!/\b(?:wait(?:ing)?|pending|idle|tick|poll(?:ing)?|keep[ -]?alive)\b/i.test(command)) return null
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: 'Use TaskOutput with the running task ID; it blocks until completion or a bounded timeout. For a CLI worker use neutral run-worker. For external CI, return and let the next reconcile tick observe it.' } }
}
