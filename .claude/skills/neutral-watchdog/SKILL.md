---
name: neutral-watchdog
description: One watchdog tick for the neutral-loop container — health-check every reconcile-loop tmux session against transcript ground truth, and heal wedged loops (nudge the live session, or respawn it). Runs as the third loop, `/loop 55m /neutral-watchdog`, inside the container (LLP 0034). Use only there — it assumes the container's shared tmux server and /work layout.
allowed-tools: Bash, Read, Monitor
---

# neutral-watchdog

One **tick** of the watchdog (LLP 0034). Enumerate the reconcile-loop sessions on
this container's tmux server, decide per session — from ground truth, never
self-report (LLP 0002) — whether it is healthy, working, or wedged, heal what is
wedged, emit one log line per session, and return. `/loop 55m` drives the cadence (55m, not 1h: intervals ≥60 min trigger /loop's interactive cloud-schedule menu, which wedges a headless session).

**This loop is autonomous — never ask a question in the terminal**, never wait for
confirmation. Every decision below is yours to make from observed state.

## Targets

Use `neutral safety sessions` to enumerate live `neutral-*` sessions, excluding
your own `$NEUTRAL_LOOP_SESSION`. The controller owns the private tmux
socket; use its `capture`, `send`, and `replace` operations instead of direct
tmux commands. Session `neutral-<name>` maps to `/work/<name>` and transcripts
`~/.claude/projects/-work-<name>/*.jsonl`, except `neutral-mayor` below.

- **`neutral-mayor` is a target, but not a reconcile loop** (LLP 0039). It runs
  in `/work` itself (like you), so its transcripts sit in
  `~/.claude/projects/-work/*.jsonl` **mixed with your own** — the mayor's are
  the files whose early records carry `/neutral-mayor` (e.g. `grep -l
  'neutral-mayor'`); never read your own files as its heartbeat. The same
  45-minute predicate applies unchanged (its tick promise is the standard
  ≤30-minute heartbeat). Heal it with the same ladder, but any respawn uses
  **`neutral safety replace --session neutral-mayor`**; the controller owns
  its command and preserves its role and model.
- **`hyp-daemon` is not yours.** The entrypoint supervisor restarts it and
  re-attaches the loops. If it is dead, log it and move on.
- **`slack-bridge` is not yours** (and not a claude session). The supervisor
  respawns it when dead; the mayor's tick degrades to polling meanwhile. If it
  is dead, log it and move on.
- **Never touch your own session** — the supervisor respawns a dead watchdog
  (LLP 0034 §mutual-coverage); you do not self-heal beyond the recycle rule below.
- A repo dir (`/work/*/`) with **no matching session at all** gets a fresh session
  (see Heal, rung 2).

## Per-session health check

1. **Staleness — the authoritative signal.** The newest event **timestamp inside**
   the session's transcripts, never file mtime (mtime is decoupled from content —
   the incident that minted LLP 0034 had mtime 13 h newer than the last event):

   ```bash
   for f in ~/.claude/projects/-work-<name>/*.jsonl; do
     tail -n 20 "$f" | jq -r '.timestamp // empty' | tail -n 1
   done | sort | tail -n 1
   ```

   Newer than **45 minutes** (loops promise ≤30-minute heartbeats, LLP 0013) →
   **healthy**, log and move on.

2. **Pane state** (`neutral safety capture --session <session>`), only for stale sessions:
   - **Working**: a live spinner / "esc to interrupt" footer — a long fan-out can
     be transcript-quiet while agents run. Treat as healthy-busy; do not nudge
     mid-work. If it is still stale *and* the pane is unchanged next tick, treat
     as wedged.
   - **Prefill text in the input box** (after `❯`): the harness renders
     suggested next messages there (e.g. `stop the loop`, `keep going`) — it is
     NOT human input and NOT a wedge sign. Leave it alone; **never press Enter
     on text you did not type** — that submits the suggestion as a real
     message. The controller clears the input line before pasting your nudge, so it
     cannot concatenate with the prefill.
   - **Interactive dialog/menu** (trust prompt, theme picker, permission ask,
     folder-sync menu): do not guess an answer — this is a respawn case.
   - **Idle prompt after an error** (e.g. `API Error` with an empty input box):
     the classic wedge — the turn died before re-arming the heartbeat.

## Heal — gentlest act that works (LLP 0034 §recovery-ladder)

1. **Nudge** (wedged, session alive, no dialog): write one resume message
   stating the observed last-event time to a file you own, then submit it:

   ```bash
   neutral safety send --session <session> --message-file <message-file>
   ```

   The controller checks the current generation, clears prefill, pastes the
   literal message, and verifies submission with at most one extra Enter.
   Check the returned `submitted` value. Then verify a new transcript event
   within five minutes using a bounded Monitor condition when available. If
   Monitor is unavailable, record recovery as unverified and recheck next tick.
   A submitted message alone is not evidence of recovery. The nudge preserves
   accumulated context.

2. **Respawn** (nudge failed its verification, interactive dialog, or missing
   session): read the pane tail and last transcript events, then ask the
   deterministic controller to replace the registered session:

   ```bash
   neutral safety replace --session <session>
   ```

   This command applies to repo loops and `neutral-mayor` alike. The controller
   preserves the pinned model and headless prompt, reserves the start budget,
   and replaces the predecessor. A hold or stale-generation error ends this
   heal attempt; log the result and return. Only an operator can rearm a hold.
   Verify an admitted replacement from new transcript events within ~5 min.
   All container replacements use this gate (LLP 0072); direct tmux launches
   bypass the protection and are forbidden.

At most **one** heal attempt per session per tick; if a heal fails verification,
escalate one rung (nudge → respawn) within the same tick, then log and let the
next tick re-check. Never loop retries.

## Log lines

One per target session:

```
watchdog: session=<name> state=<healthy|busy|nudged|respawned|dead-daemon> last_event=<ISO> detail=<...>
```

## End of tick — recycle (LLP 0013/0014)

Return and let `/loop` schedule the next tick. Exception: if **every** session was
healthy this tick and your own context has grown past ~300k tokens, recycle
instead — the tick's last act, through the safety controller (LLP 0072):

```bash
neutral safety recycle
```

The controller identifies your current generation from its injected environment
and preserves the pinned watchdog command. A denied replacement ends the tick;
only an operator can rearm the fleet.
