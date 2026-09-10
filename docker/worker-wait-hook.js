// @ts-check
import { readFileSync } from 'node:fs'
import { waitHook } from '../src/worker-wait.js'

// @ref LLP 0075#waiting [implements] — shared user hook covers the parent and its review subagents
const result = waitHook(JSON.parse(readFileSync(0, 'utf8')))
if (result) process.stdout.write(JSON.stringify(result))
