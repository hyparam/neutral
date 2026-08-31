// @ts-check
// Production-code diff stats for the concise PR body. Git supplies the diff;
// this command only filters it through the repo's configured source extensions.
import { extname } from 'node:path'
import { run } from '../git.js'
import { DEFAULT_CONFIG, loadConfig } from '../config.js'

/** @import { NeutralConfig } from '../types.d.ts' */

/**
 * Whether one changed path contributes to the PR's production-code line count.
 * @param {string} path
 * @param {NeutralConfig} config
 * @returns {boolean}
 */
export function isProductionCodePath(path, config = DEFAULT_CONFIG) {
  let p = String(path || '').replaceAll('\\', '/')
  const bracedRename = p.match(/^(.*)\{.* => (.*)\}(.*)$/)
  if (bracedRename) p = bracedRename[1] + bracedRename[2] + bracedRename[3]
  else if (p.includes(' => ')) p = p.slice(p.lastIndexOf(' => ') + 4)
  const llpDir = config.llpDir.replace(/^\.\//, '').replace(/\/+$/, '')
  if (p === llpDir || p.startsWith(`${llpDir}/`)) return false
  if (/(^|\/)(?:test|tests|__tests__)(?:\/|$)/i.test(p)) return false
  if (/\.(?:test|spec)\.[^/]+$/i.test(p)) return false
  return config.code.exts.map(e => e.toLowerCase()).includes(extname(p).toLowerCase())
}

/**
 * Parse rename-aware `git diff --numstat` output into source-only line counts.
 * Binary entries use `-` and therefore contribute zero.
 * @param {string} text
 * @param {NeutralConfig} config
 * @returns {{additions: number, deletions: number}}
 */
export function parseCodeNumstat(text, config = DEFAULT_CONFIG) {
  let additions = 0
  let deletions = 0
  for (const line of String(text || '').split('\n')) {
    if (!line) continue
    const [added, deleted, ...pathParts] = line.split('\t')
    const path = pathParts.join('\t')
    if (!isProductionCodePath(path, config)) continue
    if (/^\d+$/.test(added)) additions += Number(added)
    if (/^\d+$/.test(deleted)) deletions += Number(deleted)
  }
  return { additions, deletions }
}

/**
 * Derive production-code line stats from the same three-dot diff GitHub uses.
 * @param {string} repo
 * @param {string} base
 * @param {string} [head]
 * @param {typeof run} [exec]
 * @param {NeutralConfig} [config]
 * @returns {Promise<{additions: number, deletions: number}>}
 */
// @ref LLP 0070#body [implements] — final-head code stats exclude tests and LLPs
export async function codeLineStats(repo, base, head = 'HEAD', exec = run, config = loadConfig(repo)) {
  const out = await exec('git', ['diff', '--find-renames', '--numstat', `${base}...${head}`, '--'], repo)
  return parseCodeNumstat(out, config)
}

/**
 * @param {string} repo
 * @param {string[]} args
 * @param {typeof run} [exec]
 * @returns {Promise<number>}
 */
export async function prStatsCommand(repo, args, exec = run) {
  const positional = args.filter(a => a !== '--json')
  const base = positional[0]
  const head = positional[1] || 'HEAD'
  if (!base || positional.length > 2) {
    process.stderr.write('usage: neutral pr-stats <base> [head] [--json]\n')
    return 2
  }
  const stats = await codeLineStats(repo, base, head, exec)
  if (args.includes('--json')) process.stdout.write(JSON.stringify(stats, null, 2) + '\n')
  else process.stdout.write(`+${stats.additions} / -${stats.deletions} lines\n`)
  return 0
}
