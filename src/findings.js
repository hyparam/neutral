// @ts-check
import { FIX_LABEL } from './config.js'

/** @import { DeferredIssue } from './types.d.ts' */

/** @param {unknown} value @param {string} field */
function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`finding requires ${field}`)
  if (value.includes('<!-- neutral-')) throw new Error('finding text cannot contain Neutral protocol markers')
  return value.trim()
}

// @ref LLP 0075#follow-ups [implements] — validate the entire disposition before creating any automatic work
/** @param {number} pr @param {string} sha @param {unknown} findings @returns {DeferredIssue[]} */
export function planDeferredFindings(pr, sha, findings) {
  if (!Number.isSafeInteger(pr) || pr < 1 || !/^[0-9a-f]{7,40}$/.test(sha)) throw new Error('expected PR number and reviewed head SHA')
  if (!Array.isArray(findings) || !findings.length) throw new Error('provide every finding in original review order')
  const issues = []
  for (const [index, finding] of findings.entries()) {
    if (!finding || finding.ordinal !== index + 1) throw new Error('finding ordinals must be consecutive in original review order')
    const reason = required(finding.reason, 'reason')
    if (finding.disposition === 'reject') continue
    if (finding.disposition !== 'defer') throw new Error('unresolved fix or blocker: cannot complete deferral')
    if (!['defect', 'preference'].includes(finding.kind)) throw new Error('finding kind must be defect or preference')
    const title = required(finding.title, 'title')
    if (title.includes('\n')) throw new Error('finding title must be one line')
    const location = required(finding.location, 'location')
    const severity = required(finding.severity, 'severity')
    const evidence = required(finding.evidence, 'evidence')
    const acceptance = required(finding.acceptance, 'acceptance')
    const expected = finding.kind === 'defect' ? required(finding.expectedBehavior, 'expectedBehavior') : ''
    const marker = `<!-- neutral-deferred-finding: pr#${pr} ${sha} finding:${finding.ordinal} -->`
    issues.push({ ordinal: finding.ordinal, title, marker, labels: expected ? [FIX_LABEL] : [],
      body: `${marker}\n\nSource: #${pr} at ${sha}\nLocation: ${location}\nSeverity: ${severity}\n\n## Evidence\n${evidence}\n\n` +
        (expected ? `## Expected behavior\n${expected}\n\n` : '') +
        `## Why deferral is safe\n${reason}\n\n## Acceptance condition\n${acceptance}\n\n` +
        (expected ? 'Evidenced behavioral defect; eligible for automatic repair.\n' : 'Review preference; backlog only. A human may explicitly delegate it with neutral:fix.\n') })
  }
  return issues
}
