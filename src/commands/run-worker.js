// @ts-check
import { spawn } from 'node:child_process'

/** @import { WorkerResult } from '../types.d.ts' */

// @ref LLP 0075#waiting [implements] — one process completion produces one bounded result, with no model polling
/** @param {string[]} command @param {number} timeoutMs @returns {Promise<WorkerResult>} */
export function runWorker(command, timeoutMs) {
  if (!command.length || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) throw new Error('worker requires a command and timeout of 1–3600000 ms')
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', truncated = false, timedOut = false, finished = false
    const limit = 16000
    /** @param {string} previous @param {Buffer} chunk */
    function tail(previous, chunk) {
      const next = previous + chunk.toString()
      if (next.length > limit) truncated = true
      return next.slice(-limit)
    }
    child.stdout.on('data', chunk => { stdout = tail(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = tail(stderr, chunk) })
    /** @param {NodeJS.Signals} signal */
    function kill(signal) {
      if (!child.pid) return
      try { process.kill(-child.pid, signal) } catch { /* already exited */ }
    }
    /** @param {number} exitCode */
    function finish(exitCode) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      process.off('SIGTERM', stop)
      process.off('SIGINT', stop)
      resolve({ exitCode, timedOut, stdout, stderr, truncated })
    }
    function stop() { kill('SIGKILL'); finish(130) }
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)
    const timer = setTimeout(() => {
      timedOut = true
      kill('SIGTERM')
      setTimeout(() => { kill('SIGKILL'); finish(124) }, 250)
    }, timeoutMs)
    child.on('error', error => { stderr = error.message; finish(127) })
    child.on('close', code => { if (!timedOut) finish(code ?? 1) })
  })
}

/** @param {string[]} args */
export async function runWorkerCommand(args) {
  if (args[0] !== '--timeout-ms' || args[2] !== '--') throw new Error('usage: neutral run-worker --timeout-ms <ms> -- <command> [args...]')
  const result = await runWorker(args.slice(3), Number(args[1]))
  process.stdout.write(JSON.stringify(result) + '\n')
  return result.exitCode
}
