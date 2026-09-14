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
  if (!['Bash', 'Monitor'].includes(input.tool_name ?? '') || typeof command !== 'string') return null
  // @ref LLP 0077#waiting [implements] — reject the incident's compound cleanup and synthetic waits
  // This is a behavioral guard, not a shell parser or the process isolation boundary.
  if (/(?:^|[\s;|&()])(?:[\w./-]*\/)?(?:pkill|killall)(?=\s|$)/.test(command)) {
    return deny('Cancel only a task you started, using TaskStop with its task ID. Process-name cleanup is unavailable in the shared fleet.')
  }
  if (/(?:^|[\s;|&()])(?:[\w./-]*\/)?sleep\s/.test(command) && input.tool_input?.run_in_background === true) {
    return deny('Finish independent work, then end your turn and await the existing task completion notification. Do not create another background task just to wait. Use Monitor only for a real external condition.')
  }
  // Limit the echo guard to literal standalone output, preserving writes and real probes.
  if (/[\n\r;|&<>`$\\]/.test(command)) return null
  if (!/^\s*(?:echo|printf)\s+/.test(command)) return null
  if (!/\b(?:wait(?:ing)?|pending|idle|tick|poll(?:ing)?|keep[ -]?alive)\b/i.test(command)) return null
  return deny('Await the existing task completion notification by ending your turn after independent work. Use TaskOutput only when available, with the running task ID. For external CI, return and let the next reconcile tick observe it.')
}

/** @param {string} reason @returns {WaitHookResult} */
function deny(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
}
