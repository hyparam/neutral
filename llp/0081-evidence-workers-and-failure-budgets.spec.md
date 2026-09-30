# LLP 0081: Bind worker results and retries to verifiable evidence

**Type:** Spec
**Status:** Draft
**Systems:** Engine, Engineer, Reviewer
**Author:** Claude, from HypAware recommendation `hyprec-b61864d6c44a4c8c`
**Date:** 2026-09-30
**Related:** 0002, 0012, 0020, 0021, 0022, 0029, 0033, 0059, 0071, 0072, 0075, 0076

@ref LLP 0002 [constrained-by] — worker claims are hints pending verification
@ref LLP 0012 [extends] — the launcher supplies a verified private working directory
@ref LLP 0033#branch-birth [constrained-by] — no task branch exists before a work commit
@ref LLP 0020 [extends] — model escalation requires an attributable implementation failure
@ref LLP 0021 [extends] — durable, classified attempt accounting
@ref LLP 0022 [constrained-by] — planner complexity continues to seed the first tier
@ref LLP 0029 [constrained-by] — exact-head review markers and verdict semantics remain
@ref LLP 0059#thread-grants [constrained-by] — only explicit human grants widen review-round budgets
@ref LLP 0071#fix-pr [constrained-by] — retain one issue per deferred finding
@ref LLP 0075#waiting [extends] — the bounded process runner becomes the worker launcher
@ref LLP 0075#follow-ups [extends] — validate evidence before review completion or repair admission
@ref LLP 0072#controller [constrained-by] — worker ownership remains subordinate to fleet safety
@ref LLP 0076#init [constrained-by] — preserve namespace termination and orphan reaping

## Evidence

The HypAware usage report for 2026-09-01 through 2026-09-28 (`usage-review/
2026-09-01-to-2026-09-28`, recommendation `hyprec-b61864d6c44a4c8c`) found:

- 160 of 162 attributed `EnterWorktree` attempts failed (98.77%) across 55
  parent sessions, always with "the current working directory ... is the
  repository root, not an isolated worktree". The reconcile skill already
  documents that the runtime's built-in worktree isolation fails here and that
  every worker must run `git worktree add` itself. Repeating the reminder does
  not move the execution boundary; the failure is in setup, not in the coding
  model.
- On 2026-09-28, 24 of 90 flagged errors were `python3: command not found`
  across 22 child agents. One recovery cost a 4.1 s round trip carrying 351
  output and 72,855 cached-input tokens. Independent workers rediscover the
  same missing executable because nothing tells them what the container has.
- A worker that could not find `python3` still completed substantive testing,
  and the container's waiting hook correctly blocked a `sleep 45` poll loop. The
  waste is repeated environment discovery and mis-attributed retries, not the
  whole task.

## Problem

Workers are prepared by prompt. The reconcile skill and the implement Workflow
tell each worker to create its own detached worktree, and each worker
rediscovers the container's runtime facts. The Workflow's retry ladder holds
per-task attempts in memory and treats any dispatched task absent from the
next done-set as a model failure, so a setup, infrastructure, or integration
failure climbs the 5/3/2 model ladder with no evidence that a stronger coding
model would help. Review disposition (LLP 0075) already requires evidence and
rejects preference-driven repairs; this request extends the same discipline to
the worker-result boundary rather than adding another prompt reminder.

<a id="launch"></a>
## Requirements: prepared launch

The deterministic launcher creates a detached worktree at the exact requested
revision before starting a model, launches the process with that directory as
its actual `cwd`, and verifies the repository identity and HEAD. A worker
receives the existing worktree; it does not invoke `EnterWorktree`, runtime
worktree isolation, or repeat bootstrap setup. Task branch refs are still
created only after a real work commit (LLP 0033). A setup failure returns a
typed infrastructure result without spending an implementation-model attempt.
Build on the bounded process runner behind `neutral run-worker` (LLP 0075)
rather than adding a second runner.

<a id="capabilities"></a>
## Requirements: runtime capability manifest

Before model launch, record a bounded runtime capability manifest: available
interpreters and versions, package-manager availability, repository dependency
location, actual `cwd`/HEAD, writable worktree, and relevant installed
runner/hook versions. Inspection never installs packages as a side effect.
Pass these verified facts with the task so independent workers do not
rediscover the same missing executable.

The manifest is measured in the running container at launch, never written by
hand. Two unmerged changes already disagree about the one fact the evidence
turns on: the `container-guide-no-python3` branch adds a static guide saying
the container has no `python3`, while `codex/owned-worker-cancellation`
installs Python 3.11 and checks it at image build (`docker/check-python.sh`).
A static guide is true only for the image it was written against. Whichever
lands, the measured manifest is the single source workers read; a build-time
check may assert a fact but does not replace reporting it.

<a id="manifest"></a>
## Requirements: durable launch manifest

Write a durable launch manifest before starting a job: job and parent ids,
role, repository, actual `cwd`, base/head, branch lease, model, evidence
directory, timeout, generation, and launch state. Add the observed process
identity after spawn. Mark completion only after the process exits and
evidence is collected. On crash, reconcile manifest, process identity, and git
state before resuming or replacing; ambiguous ownership holds the target. A
manifest is process bookkeeping, never a claim that code is done. Cleanup
removes only owned worktrees after the process group is gone and needed
artifacts have been retained; dirty failed work is preserved for diagnosis
until explicitly disposed of. Fleet holds terminate owned descendants through
the existing controller and PID-namespace boundary (LLPs 0072, 0076).

<a id="results"></a>
## Requirements: typed worker results

Define a versioned worker-result schema with job id, repository, action, exact
base/head revisions, outcome (`completed`, `failed`, `blocked`, `timed-out`),
artifact paths and digests, commands with exit statuses, and evidence
references. Reject malformed results and revision mismatches. Store full
reports separately; the coordinator consumes a compact result and
independently verifies git ancestry, current head, CI, and artifact existence.
A `testsPass` boolean alone cannot satisfy a completion or escalation gate.

Review results contain findings with stable ids, cited revision and location,
observed behavior, expected behavior, verification evidence, scope relation,
and proposed disposition. A clean review requires a successful complete worker
result covering the requested head; failed or timed-out reviewers cannot
produce clean markers. Aggregate independent reviewer results by finding
identity, preserving each source and disagreement. Disagreement invokes one
targeted adjudication over the cited evidence, not a rerun of the whole
review. Reviewer selection, the full-review cap, human grants, ship-risk
assessment, and merge authority are unchanged.

Mechanical validation checks evidence shape, artifact existence and digest,
revisions, and command results; it does not claim semantic correctness. The
existing independent triager decides defect versus preference, safe deferral,
and blocker status. Automatic follow-ups go through `neutral defer-findings`,
preserving LLP 0075's behavioral-evidence gate and idempotent issue
identities. An unchanged findings head still routes to targeted disposition,
never another full review by default.

<a id="budgets"></a>
## Requirements: classified, durable attempt budgets

Persist attempt events keyed by repository, task, relevant input revisions,
model tier, job id, and verified failure fingerprint. Record the
controller-observed failure class: `implementation`, `observation`,
`infrastructure`, `merge-conflict`, `authorization`, or `indeterminate`. Only
`implementation` failures consume the existing 5/3/2 model-tier ladder (LLP
0021). Other classes use bounded controller recovery and never trigger a
stronger coding model. Every class consumes an overall dispatch budget;
uncertainty is not a free retry. The default overall budget is ten dispatches
per task and input revision, matching the ladder's maximum for a mechanical
entry.

Two consecutive identical verified failure fingerprints without a relevant
code or evidence change allow one targeted diagnosis, then hold the work.
Diagnosis counts against the overall budget. A new model alone is not new
evidence. Human grants are explicit and attributable. Recovery rereads git and
process state; the attempt journal records resource consumption, never task
completion. Restarting the Workflow must not reset the same task's budget.

<a id="validation"></a>
## Validation and rollout

Record structured results and failure classes in shadow mode first. Review a
sample of classifications by hand before enforcing retry routing. Then enable
schema and revision validation, then durable budgets, retaining current model
tiers and review caps throughout. Rollback stops new dispatch for affected
jobs while existing workers drain, preserving attempt history and current-head
gates.

Offline tests cover forged success summaries, missing or mismatched artifacts,
stale heads, reviewer timeout, duplicate findings, partial reviewer failure,
transient GitHub failure, failing tests, merge conflict, repeated identical
failures, and restart mid-attempt. Launch fixtures include a dirty main
checkout, an already checked-out target branch, failed worktree creation,
timeout with a grandchild, and a crash between manifest reservation and
process registration. They verify actual `cwd`/HEAD, no writes to the main
checkout, no duplicate live worker, no premature task ref, and artifact
retention before cleanup. They prove infrastructure errors never escalate the
model, budgets survive restart, no failed review becomes approved, and a real
implementation defect still retries and escalates within policy.

A seven-day canary measures input, cache, and output tokens separately per
completed task, attempts by failure class, repeated failure fingerprints,
rejected and accepted review findings, follow-up defects versus preferences,
review latency, and escaped defects. Acceptance requires complete evidence for
every clean marker, no budget reset after restart, no model escalation caused
solely by infrastructure failure, and no increase in escaped defects in the
sampled completed work. Report actual token and latency changes without
assuming fewer reviews imply equal quality.

## Non-goals

This request does not remove independent review, drop the review caps or
current-head checks, or weaken the waiting hook. It does not change what
counts as done: a task is merged only when git says so (LLP 0002).
