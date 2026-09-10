// @ts-check
// @ref LLP 0072#evidence-alerts [implements] — private bounded pane capture, attached before permit release
import { mkdirSync, appendFileSync, statSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
const name = process.argv[2]
if (!/^[A-Za-z0-9_-]+$/.test(name ?? '')) process.exit(2)
const dir = join(homedir(), '.local/state/neutral-capture')
mkdirSync(dir, { recursive: true, mode: 0o700 })
const file = join(dir, `${name}.log`)
process.stdin.on('data', chunk => {
  try {
    try { if (statSync(file).size >= 1024 * 1024) renameSync(file, `${file}.previous`) } catch { /* first write */ }
    appendFileSync(file, chunk, { mode: 0o600 })
  } catch { /* evidence must never block termination or admission */ }
})
