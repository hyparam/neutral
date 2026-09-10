// @ts-check
import { createConnection } from 'node:net'
/** @import { SafetyRequest } from '../docker/safety-types.d.ts' */

/** @param {SafetyRequest} request @param {{ operator?: boolean, socket?: string }} [options] @returns {Promise<any>} */
export function safetyRequest(request, { operator = false, socket } = {}) {
  const path = socket ?? (operator ? '/run/neutral-safety/operator.sock' : (process.env.NEUTRAL_SAFETY_SOCKET || '/run/neutral-safety/client.sock'))
  return new Promise((resolve, reject) => {
    const connection = createConnection(path)
    let response = ''
    connection.setTimeout(150_000, () => connection.destroy(new Error('safety request timed out; do not replay a launch blindly')))
    connection.on('connect', () => connection.write(JSON.stringify(request) + '\n'))
    connection.on('error', reject)
    connection.on('data', chunk => {
      response += chunk.toString()
      if (response.length > 1024 * 1024) connection.destroy(new Error('oversized safety response'))
    })
    connection.on('end', () => {
      try {
        const result = JSON.parse(response)
        if (!result.ok) throw new Error(result.error)
        resolve(result.value)
      } catch (err) { reject(err) }
    })
  })
}

/** @param {string[]} args @returns {Promise<number>} */
export async function safetyCommand(args) {
  const [action = 'status', ...rest] = args
  const values = new Map()
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') continue
    if (!['--session', '--incident', '--reason', '--deployment'].includes(rest[i]) || !rest[i + 1]) throw new Error('invalid safety arguments')
    values.set(rest[i], rest[++i])
  }
  /** @type {SafetyRequest} */
  const request = { action, session: values.get('--session'), incident: values.get('--incident'),
    reason: values.get('--reason'), deployment: values.get('--deployment') }
  if (['replace', 'recycle'].includes(action)) {
    request.session ??= process.env.NEUTRAL_LOOP_SESSION
    if (action === 'recycle') {
      if (request.session !== process.env.NEUTRAL_LOOP_SESSION || !process.env.NEUTRAL_RUN_ID) throw new Error('recycle must target this loop generation')
      request.run = process.env.NEUTRAL_RUN_ID
    } else {
      const status = await safetyRequest({ action: 'status' })
      request.run = status.loops.find((/** @type {{ session: string }} */ l) => l.session === request.session)?.run
    }
  }
  const result = await safetyRequest(request, { operator: ['init', 'rearm', 'stop'].includes(action) })
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  return 0
}
