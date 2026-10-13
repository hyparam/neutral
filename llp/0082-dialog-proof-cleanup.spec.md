# LLP 0082: Dialog-proof cleanup and a visible dialog as a wedge

**Type:** Spec
**Status:** Draft
**Systems:** Engine, Engineer
**Author:** Claude, from HypAware recommendation `hyprec-6989cbe64a830241`
**Date:** 2026-10-13
**Related:** 0002, 0034, 0039, 0075, 0077

@ref LLP 0002 [constrained-by] — a wedge is observed on the pane, never inferred from a log line
@ref LLP 0034#wedge-predicate [extends] — a visible confirmation dialog is a wedge however fresh the transcript
@ref LLP 0034#recovery-ladder [extends] — a dialog on a fresh session gets one cadence of grace, then the respawn rung
@ref LLP 0039 [extends] — the mayor pushes a dialog card so a human can answer within that cadence
@ref LLP 0075#waiting [constrained-by] — the shared hook stays the one place worker-side guards live
@ref LLP 0077#waiting [extends] — cleanup is `git worktree remove`, never `rm` on a variable path

## Incident

Between 2026-09-22 and 2026-10-10 the fleet recorded nine stuck sessions; seven
were a Claude Code confirmation dialog. Every one with an identified command was
an `rm -f` on a shell-variable path during scratch or worktree cleanup
(`rm -f $S/*.log`, `rm -f $HYP_CHECK_LOG/*`, `rm -f "$S/$w/node_modules"`).
The harness names the rule in the dialog: "Dangerous rm operation on
possibly-empty variable path". It prompts even under
`--dangerously-skip-permissions`, and nobody is at the terminal to answer. A
ship-risk worker running the same cleanup with a literal `/tmp/tmp.*` path
returned in under a second, so the variable-path form is the trigger, not the
delete.

A wedged **main loop** is caught by the watchdog's staleness predicate and
respawned within about an hour. A wedged **background worker** is never caught:
the parent loop keeps ticking, so its transcript stays fresh, the watchdog
reports it healthy for tick after tick, and the mayor's "unhealed" card keys on
the same transcript age. The 2026-10-10 hypaware-server triage worker held its
work slot for at least 41.5 hours this way, while the watchdog logged the same
dialog on about 40 consecutive ticks.

<a id="cleanup"></a>
## Cleanup never raises a dialog

No worker or loop runs `rm` on a path built from a shell variable, and none
removes `node_modules` links inside a scratch worktree. A scratch worktree is
removed with:

```
git -C <repo> worktree remove --force "<path>" ; git -C <repo> worktree prune
```

If a stray file outside git must go, the command names a literal absolute path
under `/tmp` and runs as its own Bash call. A "Do you want to proceed?" dialog
cannot be answered in this fleet; a command that would raise one wedges the
worker for days.

The rule is stated in every worker brief and enforced by the shared PreToolUse
hook (LLP 0075): a Bash command whose `rm` arguments include a `$`-prefixed
path is denied with the replacement command as the reason, so the harness never
reaches its own dialog. The hook is a behavioral guard, not a shell parser;
`git rm`, `npm rm`, and literal paths are left alone, and alternate spellings
may evade it.

<a id="dialog-wedge"></a>
## A visible dialog is a wedge

The watchdog captures the pane of **every** session on every tick, not only
stale ones. A capture showing "Do you want to proceed?" or any Yes/No menu is
logged `state=dialog` even when the transcript is fresh, because the fresh
transcript belongs to the parent loop while the dialog belongs to a worker that
has stopped. The watchdog never types into the pane: it cannot know which
answer is safe.

Grace is one cadence. On the first tick the watchdog logs the dialog with the
command text; the mayor re-derives the same pane state and posts a `dialog`
card so a human can answer in tmux. On the second consecutive tick showing the
same dialog, the watchdog replaces the session through the controller
(`neutral safety replace`, LLP 0072). The recommendation asked for TaskStop on
the worker alone; that tool acts only on tasks owned by the calling session,
so the watchdog cannot reach a worker owned by a reconcile loop. Replacement is
the rung that exists, and the orphaned worktree is reaped by LLP 0076. A stale
session showing a dialog stays an immediate respawn, as LLP 0034 already says.

<a id="validation"></a>
## Verification

- `npm test` covers the hook: each incident command is denied, and literal
  paths, `git worktree remove --force "$WT"`, and `git rm`/`npm rm` pass.
- Over 14 days, no Bash tool call in a `/work/*` session is older than 45
  minutes without a tool result, and no watchdog tick logs `state=healthy` for
  a session whose capture mentions a dialog.
- Worker cleanup calls contain `git worktree remove --force` and no `rm` on a
  `$`-prefixed path.
