#!/usr/bin/env node
// Fake services only: no model SDK, credentials, or external network calls.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
const mode = process.argv[1].split('/').at(-1)
if (process.argv.includes('--worker')) {
  setInterval(() => writeFileSync(`/work/worker-${process.pid}`, String(Date.now())), 100)
} else if (mode === 'hyp') {
  if (process.argv[2] === 'attach') {
    const port = Number(readFileSync('/work/fake-port', 'utf8'))
    writeFileSync('/home/neutral/.claude/settings.json', JSON.stringify({ _hypaware: { port } }))
  } else {
    const server = createServer((_req, res) => res.end('fake gateway'))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('TCP address missing')
      writeFileSync('/work/fake-port', String(address.port))
      console.log('fake gateway ready')
    })
  }
} else {
  appendFileSync('/work/model-starts.jsonl', JSON.stringify({ timestamp: new Date().toISOString(), run: process.env.NEUTRAL_RUN_ID, pid: process.pid }) + '\n')
  console.log(`fake model started ${process.env.NEUTRAL_RUN_ID}`)
  const child = spawn(process.execPath, [process.argv[1], '--worker'], { detached: true, stdio: 'ignore' })
  child.unref()
  setInterval(() => {}, 1000)
}
