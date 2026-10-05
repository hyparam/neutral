// @ts-check
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, readdirSync, readlinkSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { injectIntoPane } from './slack-bridge.js'
import { sessionName, ORCHESTRATOR_MODEL } from '../src/commands/start.js'

const exec = promisify(execFile)
export const SAFETY_DIR = '/var/lib/neutral-safety'
export const RUNTIME_DIR = '/run/neutral-safety'
export const HOME = '/home/neutral'
export const quote = (/** @type {string} */ s) => `'${s.replaceAll("'", "'\\''")}'`
export const HEADLESS_PROMPT = 'Headless autonomous session: no human is at this terminal. Never present interactive menus, choices, or questions in the terminal. When a skill or tool offers options (for example /loop offering a cloud schedule), silently take the session-local non-interactive path and continue.'

/** @import { LoopDefinition, ProcessObservation, ProcessRun } from './safety-types.d.ts' */

/** @param {NodeJS.ProcessEnv} env */
export function fleetConfig(env) {
  const repos = (env.NEUTRAL_REPOS ?? '').split(/[\s,]+/).filter(Boolean)
  if (!repos.length || repos.length > 98 || repos.some(r => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r) || r.split('/').some(s => s === '.' || s === '..'))) throw new Error('invalid NEUTRAL_REPOS')
  const model = env.NEUTRAL_MODEL || ORCHESTRATOR_MODEL
  const args = env.NEUTRAL_CLAUDE_ARGS || '--dangerously-skip-permissions'
  const command = (/** @type {string} */ m, /** @type {string} */ prompt) => `claude --model ${quote(m)} ${args} --append-system-prompt ${quote(HEADLESS_PROMPT)} ${quote(prompt)}`
  /** @type {LoopDefinition[]} */
  const loops = repos.map(repo => ({ id: `repo:${repo}`, session: sessionName(repo), cwd: `/work/${repo.split('/')[1]}`,
    command: command(model, '/loop /neutral-reconcile') }))
  if (env.NEUTRAL_WATCHDOG !== '0') loops.push({ id: 'watchdog', session: 'neutral-watchdog', cwd: '/work',
    command: command(env.NEUTRAL_WATCHDOG_MODEL || model, '/loop 55m /neutral-watchdog') })
  if (env.NEUTRAL_MAYOR === '1') {
    for (const name of ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'SLACK_CHANNEL_ID', 'SLACK_ALLOWED_USER_IDS']) if (!env[name]) throw new Error(`missing ${name}`)
    loops.push({ id: 'mayor', session: 'neutral-mayor', cwd: '/work', command: command(env.NEUTRAL_MAYOR_MODEL || model, '/loop /neutral-mayor') })
  }
  if (new Set(loops.map(l => l.session)).size !== loops.length || loops.some(l => ['neutral-watchdog', 'neutral-mayor'].includes(l.session) && l.id.startsWith('repo:'))) throw new Error('duplicate or reserved loop name')
  const hyp = env.NEUTRAL_HYPAWARE !== '0'
  const sentinel = env.NEUTRAL_SENTINEL !== '0' && !!env.SLACK_BOT_TOKEN && !!env.SLACK_CHANNEL_ID
  if (env.NEUTRAL_SENTINEL === '1' && !sentinel) throw new Error('sentinel requires Slack outbound configuration')
  // Model/credential changes do not change stable loop identities or clear history.
  const registry = createHash('sha256').update(JSON.stringify(loops.map(l => ({ id: l.id, cwd: l.cwd })).sort((a, b) => a.id.localeCompare(b.id)))).digest('hex')
  return { loops, hyp, sentinel, mayor: env.NEUTRAL_MAYOR === '1', registry }
}

export function safetyClock() {
  return { boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    mono: Number(readFileSync('/proc/uptime', 'utf8').split(' ')[0]) * 1000, wall: Date.now() }
}

/** @param {number} pid */
function processIdentity(pid) {
  try { return readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1)?.split(' ')[19] ?? null }
  catch { return null }
}

/** @param {number} root @param {number} port */
export function processOwnsPort(root, port) {
  const family = new Set([root])
  const parents = new Map()
  for (const p of readdirSync('/proc').filter(n => /^\d+$/.test(n))) {
    try { parents.set(Number(p), Number(readFileSync(`/proc/${p}/stat`, 'utf8').split(') ').at(-1)?.split(' ')[1])) } catch { /* exited */ }
  }
  for (let changed = true; changed;) {
    changed = false
    for (const [pid, parent] of parents) {
      if (family.has(parent) && !family.has(pid)) {
        family.add(pid)
        changed = true
      }
    }
  }
  const inodes = new Set()
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    for (const line of readFileSync(file, 'utf8').trim().split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/)
      if (cols[3] === '0A' && parseInt(cols[1].split(':')[1], 16) === port) inodes.add(`socket:[${cols[9]}]`)
    }
  }
  for (const pid of family) {
    try {
      for (const fd of readdirSync(`/proc/${pid}/fd`)) {
        try { if (inodes.has(readlinkSync(`/proc/${pid}/fd/${fd}`))) return true } catch { /* raced */ }
      }
    } catch { /* exited */ }
  }
  return false
}

// @ref LLP 0072#controller [implements] — fixed commands as neutral; root owns permits and lifecycle
export class SafetyPlatform {
  /** @param {NodeJS.ProcessEnv} env */
  constructor(env) {
    this.env = { ...env, HOME, USER: 'neutral', LOGNAME: 'neutral', NEUTRAL_SAFETY_SOCKET: `${RUNTIME_DIR}/client.sock`,
      NEUTRAL_HEADLESS_PROMPT: HEADLESS_PROMPT, NEUTRAL_MAYOR_CMD: 'neutral safety recycle --session neutral-mayor' }
  }
  /** @param {string} cmd @param {string[]} args @param {number} [timeout] */
  async asNeutral(cmd, args, timeout = 5000) {
    return (await exec('/usr/bin/setpriv', ['--reuid=neutral', '--regid=neutral', '--init-groups', '--', cmd, ...args],
      { env: this.env, timeout, maxBuffer: 1024 * 1024 })).stdout.trim()
  }
  // @ref LLP 0077#supervisor [implements] — private root server; never load worker-owned tmux config
  /** @param {string[]} args @param {string} [input] */
  async tmux(args, input) {
    const child = exec('/usr/bin/tmux', ['-f', '/dev/null', '-S', `${RUNTIME_DIR}/tmux/server.sock`, ...args],
      { env: { ...this.env, HOME: '/root', SHELL: '/bin/sh', TMUX: undefined, BASH_ENV: undefined, ENV: undefined },
        timeout: 5000, maxBuffer: 1024 * 1024 })
    if (input !== undefined) child.child.stdin?.end(input)
    return (await child).stdout.trimEnd()
  }
  async sessions() { return (await this.tmux(['list-sessions', '-F', '#S'])).split('\n').filter(Boolean) }
  /** @param {ProcessRun} run */
  async capture(run) { return this.tmux(['capture-pane', '-p', '-t', `=${run.session}:`]) }
  /** @param {ProcessRun} run @param {string} message */
  async send(run, message) { return injectIntoPane(message, run.session, (args, input) => this.tmux(args, input)) }
  async prepare() { await this.asNeutral('/opt/neutral/docker/prepare.sh', [], 120_000) }
  async attach() { await this.asNeutral('hyp', ['attach', 'claude'], 3000).catch(() => {}) }
  /** @param {LoopDefinition} def @param {ProcessRun|undefined} old @returns {Promise<ProcessRun>} */
  async launch(def, old) {
    const run = randomUUID()
    const permit = `${RUNTIME_DIR}/permits/${run}`
    const shell = `i=0; while [ ! -f ${quote(permit)} ]; do i=$((i+1)); [ "$i" -lt 200 ] || exit 75; sleep 0.05; done; export NEUTRAL_RUN_ID=${quote(run)}; export NEUTRAL_LOOP_SESSION=${quote(def.session)}; exec ${def.command}`
    // Multiple argv entries make tmux exec setpriv directly, with no root shell.
    const paneCommand = ['/usr/bin/setpriv', '--reuid=neutral', '--regid=neutral', '--init-groups', '--',
      '/usr/bin/env', `HOME=${HOME}`, 'USER=neutral', 'LOGNAME=neutral', 'SHELL=/bin/bash', 'TMUX=', '/bin/sh', '-c', shell]
    if (old && (await this.observe(old)).exists) {
      await this.tmux(['respawn-pane', '-k', '-t', `=${def.session}:`, '-c', def.cwd, ...paneCommand])
    } else {
      // No attach-or-create: an unknown live session is not permission to duplicate it.
      await this.tmux(['new-session', '-d', '-s', def.session, '-c', def.cwd, ...paneCommand])
    }
    await this.tmux(['set-option', '-w', '-t', `=${def.session}:`, 'remain-on-exit', 'on'])
    await this.tmux(['pipe-pane', '-t', `=${def.session}:`])
    await this.tmux(['pipe-pane', '-t', `=${def.session}:`, `/usr/bin/setpriv --reuid=neutral --regid=neutral --init-groups -- /usr/bin/env HOME=/home/neutral node /opt/neutral/docker/safety-capture.js ${quote(def.session)}`])
    const pid = Number(await this.tmux(['display-message', '-p', '-t', `=${def.session}:`, '#{pane_pid}']))
    const identity = processIdentity(pid)
    if (!identity) throw new Error('new pane process missing')
    writeFileSync(permit, '', { mode: 0o644, flag: 'wx' })
    if (old) rmSync(`${RUNTIME_DIR}/permits/${old.run}`, { force: true })
    return { ...def, run, pid, identity }
  }
  /** @param {ProcessRun} run @returns {Promise<ProcessObservation>} */
  async observe(run) {
    let text
    try { text = await this.tmux(['display-message', '-p', '-t', `=${run.session}:`, '#{pane_pid} #{pane_dead} #{pane_dead_status}']) }
    catch { return { exists: false, alive: false, exit: null } }
    const [pid, dead, status] = text.split(' ')
    return { exists: true, alive: dead === '0' && Number(pid) === run.pid && processIdentity(run.pid) === run.identity,
      exit: dead === '1' && status ? Number(status) : null }
  }
  /** @param {ProcessRun} run */
  async gateway(run) {
    try {
      if (!(await this.observe(run)).alive) return null
      const port = JSON.parse(readFileSync(`${HOME}/.claude/settings.json`, 'utf8'))?._hypaware?.port
      if (!Number.isInteger(port) || port < 1 || port > 65535) return null
      // Docker root lacks CAP_SYS_PTRACE. Same-uid /proc socket inspection
      // verifies ownership without adding a capability or trusting HTTP alone.
      const owned = await this.asNeutral('node', ['/opt/neutral/docker/safety-port-probe.js', String(run.pid), String(port)])
      if (owned !== 'true') return null
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })
      return port
    } catch { return null }
  }
  async modelProcessesAbsent() {
    // On held boot no code running as neutral may be a model client. Prefer
    // refusing rearm over overlooking a manually launched unknown process.
    for (const pid of readdirSync('/proc').filter(n => /^\d+$/.test(n))) {
      try {
        const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
        if (argv.slice(0, 2).some(s => /(?:^|\/)(?:claude|codex)(?:$|\/)|claude-code|codex.*\.js/.test(s))) return false
      } catch { /* exited */ }
    }
    return true
  }
  hasHypConfig() { return existsSync(`${HOME}/.hyp/hypaware-config.json`) }
}
