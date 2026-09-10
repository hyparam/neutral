// @ts-check
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// @ref LLP 0075#waiting [implements] — preserve HypAware and existing hooks on every boot
/** @param {string} directory */
export function installWorkerHooks(directory) {
  mkdirSync(directory, { recursive: true })
  const path = join(directory, 'settings.json')
  const settings = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  const command = 'node /opt/neutral/docker/worker-wait-hook.js'
  const existing = settings.hooks?.PreToolUse || []
  settings.hooks = { ...settings.hooks, PreToolUse: [
    ...existing.filter((/** @type {any} */ entry) => !entry.hooks?.some((/** @type {any} */ hook) => hook.command === command)),
    { matcher: 'Bash|TaskOutput', hooks: [{ type: 'command', command, timeout: 5 }] }
  ] }
  writeFileSync(`${path}.neutral-tmp`, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 })
  renameSync(`${path}.neutral-tmp`, path)
}

if (process.argv[1]?.endsWith('/install-worker-hooks.js')) installWorkerHooks(join(homedir(), '.claude'))
