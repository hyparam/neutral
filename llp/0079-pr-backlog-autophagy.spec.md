# LLP 0079: PR backlog relevance autophagy

**Type:** Spec
**Status:** Active
**Systems:** Core, Engine
**Author:** Phil / Codex
**Date:** 2026-09-17
**Related:** 0002, 0011, 0035, 0036, 0047, 0074

## Request

Add an autophagy option for the three production-loop repositories that evaluates
whether open PRs are still needed, superseded, already implemented, or made
irrelevant by changes in the repository's requirements or architecture.

This extends @ref LLP 0011 and @ref LLP 0047 with a built-in advisory member.
It does not require the Draft repo-declared registry proposed in LLP 0074.

## Requirements

### <a id="configuration"></a>Configuration and scheduling

`autophagy.prBacklog` is a boolean in `.neutral/config.json`, default `false`.
Enabling it adds `pr-backlog` to the existing least-recently-run rotation after
`cleanup` in the fixed tie order. Idle, context-recycle priority, admission,
one open autophagy PR, and disposition cooldowns remain unchanged. Thus a busy
or capacity-bound repo can defer this audit; it is not a new maintenance rung.
Enable the option explicitly in each production repo after deploying support.

### <a id="observation"></a>Observe the whole PR backlog

Read all open PRs using paginated GitHub observation, including drafts and PRs
outside Neutral's maintenance scope. A positive count is the mechanical signal
that there is something to inspect; it is not evidence that anything is obsolete.
An empty backlog is ineligible. Failed or malformed observation is unknown and
ineligible, never an empty successful scan. Surface the reason in `neutral idle`.

The worker reads each PR's intent, current diff, linked requests, reviews and human
discussion, current base tree, and possible replacements. It records exact head
and base SHAs and links to supporting commits, PRs, code and decisions. Re-read
the inventory and cited facts before publishing; changed facts require a fresh
assessment. Bounded work must name unassessed PRs, never imply full coverage.

### <a id="judgment"></a>Relevance judgments

- **Still needed:** identify the unmet requirement and unique remaining change.
- **Already implemented:** show the intended behavior in the current base and
  account for every meaningful remaining part of the PR. Ancestry or patch
  equivalence supports the claim; squashes require inspecting the resulting code.
- **Superseded:** cite the replacement and map the original intent to it. A
  replacement still open is a dependency, not grounds for closure now.
- **Irrelevant:** cite an explicit newer requirement/decision or removal of the
  affected feature, and account for remaining useful work and dependents.
- **Uncertain:** state missing evidence or the specific human decision needed.

Age, conflict status, failing CI, similar titles, and inactivity alone never
justify closure. Partial overlap retains the useful remainder. Cross-repo
replacement claims require evidence from that repo; inaccessible evidence is
uncertain. Stacked PRs and LLP coverage dependencies must be checked before any
closure recommendation.

### <a id="delivery"></a>Recommendations, held for human disposition

One worker produces a dated report on `autophagy/pr-backlog-<date>` in its own
worktree, delivered as a draft PR. The report lists every assessed PR and its
verdict, evidence, unique remainder, dependents, and recommended human action.
It is a proposal, not completion/coverage state. The worker does not close,
merge, relabel, adopt, edit or comment on the assessed PRs, delete branches, or
rewrite accepted LLPs. Even merging the report authorizes no automatic action.
The report PR inherits the existing held-never-automerge boundary.

If there are no actionable recommendations, open nothing and log a no-op. If
observation failed or the scan is incomplete, log that distinctly and keep the
member eligible for retry. A successful report passes the repository checks and
follows the shared publishing procedure.

### <a id="damping"></a>Damp by the observed backlog

Extend @ref LLP 0047#noop-dampening for this member: target HEAD alone is
insufficient because new PRs and replies need not advance it. `neutral idle`
returns `prBacklog.fingerprint`, hashing the sorted complete inventory's PR
numbers, URLs, titles, head/base refs and SHAs, and GitHub update timestamps.
After a complete no-op, the orchestrator retains that fingerprint in its session
and passes `--backlog-snapshot <hash>`. The CLI damps only while fresh observation
matches. New/closed PRs, updates or base movement invalidate it. A generic
`--damped pr-backlog` is ignored without the matching snapshot. A recycle resets
the hint; no durable agent-written receipt claims that a PR is done.

## Verification

Offline tests cover boolean opt-in, selection, empty/unknown observation, full
pagination, stable and changed fingerprints, cooldowns, global gating, idle and
admission gating, recycle priority, and snapshot-based no-op damping. Actual
semantic judgments remain reviewable human-facing proposals under @ref LLP 0002.
