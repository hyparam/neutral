// @ts-check
// @ref LLP 0072#recovery [implements] — same-uid ownership probe, no CAP_SYS_PTRACE needed
import { processOwnsPort } from './safety-platform.js'
const pid = Number(process.argv[2])
const port = Number(process.argv[3])
if (!Number.isInteger(pid) || pid < 1 || !Number.isInteger(port) || port < 1 || port > 65535) process.exit(2)
process.stdout.write(String(processOwnsPort(pid, port)))
