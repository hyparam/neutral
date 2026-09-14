# LLP 0077: Owned worker waiting and protected tmux supervision

**Type:** Spec
**Status:** Accepted
**Systems:** Engine, Engineer, Reviewer
**Author:** Codex
**Date:** 2026-09-14
**Related:** 0072, 0075, 0076, 0034, 0042

@ref LLP 0075#waiting [extends] — completion guidance must match available tools
@ref LLP 0072#controller [extends] — protect the shared tmux server as well as admission state
@ref LLP 0076#init [constrained-by] — preserve tini reaping and held restart behavior
@ref LLP 0034#recovery-ladder [extends] — inspection and nudges go through the controller
@ref LLP 0042#inbound-framing [constrained-by] — retain literal input, prefill clearing, and submission verification

## Incident

On September 11 the PR #596 review worker searched for TaskOutput and received
“No matching deferred tools found.” It created background sleep tasks while
waiting for a forked reviewer, then issued a compound loop containing
`pkill -f "sleep"` at 23:53:13.051 UTC to clear them. The shared tmux server's
original command line contains `sleep 0.05` from the launch permit gate and
ran under the worker UID. Two missing loops tripped the fleet hold within
one second. The user authorized fixing this failure path on September 14.

<a id="waiting"></a>
## Owned completion and cancellation

Every dispatched worker receives a completion contract: finish independent
work, then end its turn and await the existing task's completion notification.
Use blocking TaskOutput only when the tool is available, never assume its
presence. A missing tool is not a reason to create background sleep tasks or
infer reviewer completion from transcript timestamps. External conditions may
use Monitor; external CI remains a next-tick observation.

Cancellation targets the task ID returned when the worker started that task,
using TaskStop. If unavailable, report the ID and return with work incomplete.
Cleanup covers the worker's own files and worktree, not process-name matches.
The shared hook rejects the observed compound pkill/killall commands and
background Bash sleep commands, including polling loops. It continues to
force blocking TaskOutput when present. Hook matching is behavioral guidance,
not a shell sandbox; alternate spellings and programs may evade it.

<a id="supervisor"></a>
## Controller-owned tmux

The tmux server runs as root with a private socket beneath a root-only runtime
directory. It loads no worker-owned tmux configuration. Pane launch execs
setpriv directly and drops to neutral before interpreting any shell command.
Capture helpers also run as neutral. Workers retain their home and role
variables but receive no direct tmux connection. The server's uid prevents
worker-originated signals, including the incident's full-command-line match.

Expose only fixed controller operations: list actual sessions, capture a live
registered pane, and submit bounded plain text to a live registered loop at
its current generation. No caller-supplied tmux argv, format expansion, shell
command, or root process launch is accepted. Input is bracketed paste through
the existing submission verification; control characters are refused. Held
fleets refuse input. Inspection remains available for diagnostics. Watchdog,
mayor, and Slack bridge use these operations; root operators may attach to the
private socket directly for inspection.

This isolates the supervisor from signals, not workers from one another.
Workers still share a UID and work volume. Strong per-worker isolation is a
separate change. The durable hold and explicit operator rearm remain intact.

<a id="validation"></a>
## Verification

Replay the incident command through the real hook. Exercise denied compound
cleanup and synthetic waits while retaining actual background work, Monitor
conditions, and task-specific cancellation. Test broker rejection of stale
or unknown targets, service-pane input, control characters, and input while
held, plus literal multiline message delivery.

In a disposable no-model Docker test, prove the server UID is root and pane
UID is neutral, worker signals fail, the private socket refuses worker access,
and an actual worker-issued `pkill -f sleep` leaves both fake service panes
alive. Retain gateway ownership, process reaping, recovery counts, persistent
holds, controller-death teardown, and broker inspection/input checks. No
production restart or rearm follows from test success alone.
