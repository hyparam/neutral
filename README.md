# neutral

Declarative reconcilers that take **out-of-draft LLPs** and converge a repo all
the way to **review-ready PRs** — technical design → implementation design →
task fan-out → integration PR → review → fix.

Each stage is a **reconciler**, not a script. It holds a *base state* (an
invariant) and closes the gap from **git/file ground truth**. It can't fabricate
"done", because "done" is a fact you re-derive from the world — a real commit on
the integration branch, a real `@ref` in a design — never a status field an
agent wrote.

```
out-of-draft LLPs ──Designer──▶ ordered change sets (a DAG), each with a
                                technical design that @refs the LLPs it covers
        change set ──ImplDesigner──▶ implementation design + task list (dep edges)
        change set ──Implementer──▶ wave loop: parallel impl (worktree-isolated)
                                    then SERIAL verified merge into integration/<cs>
        change set ──Reviewer──▶ /dual-review → fix loop (≤N) → HOLD ready-for-merge
```

## Why declarative

The predecessor (`/feature-flow`) was imperative formulas. It worked, but its
failure modes were all the same shape: agents **fabricating results** under
ambiguous prose — a merge recorded with a non-existent SHA, a review verdict
invented, a recovery step that threw away completed work. Neutral's reconcilers
read ground truth before acting and verify every claim against it, so those
failures can't survive. See [LLP 0001](llp/0001-reconciler-architecture.decision.md)
and [LLP 0002](llp/0002-ground-truth.principle.md).

## The ready-queue, without beads

The one indispensable thing a task tracker gives you is *"list the unblocked
open tasks."* Neutral derives it from git instead of a database:

- **dependency edges** are declared in the change set's implementation `plan`
  LLP (where the impl-designer already decides ordering),
- **completion** is derived from git: a task is done iff its branch is a
  *verified ancestor* of the integration branch.

`ready = { t : not done(t) and deps(t) ⊆ done }` — a pure function of (task
file, git state). No ledger to drift or fabricate. See
[LLP 0003](llp/0003-coverage-and-change-sets.spec.md).

## Status

### Optional PR backlog audit

Enable the advisory autophagy member in each repo's `.neutral/config.json`,
merging this field into its existing configuration:

```json
{ "autophagy": { "prBacklog": true } }
```

On an eligible idle tick, the loop assesses all open PRs for remaining need,
already-landed work, supersession, or changed requirements. Evidence and proposed
human actions go into a held draft report PR; assessed PRs are left unchanged.
An unmerged replacement is a dependency, and uncertain cases remain open.
The option defaults off and shares autophagy's admission gate, cooldowns and
one-open-proposal limit, so busy repos may defer the audit.

`neutral idle --json` exposes the selection, eligibility reasons and complete
PR inventory. Complete no-op scans use `--backlog-snapshot <fingerprint>` to
avoid repeats until the observed backlog changes. See
[LLP 0079](llp/0079-pr-backlog-autophagy.spec.md) for the evidence and delivery rules.

Deploy the updated CLI and reconcile skill before enabling the option in the
production repos. Verify each repo's `neutral idle --json` includes a
`pr-backlog` member and a successful `prBacklog` observation; `initiative: null`
is expected when existing work, admission, cooldowns or an open autophagy PR
blocks selection.

### Development

Milestone 0: deterministic core + `neutral status`. The reconcilers
(Designer, Impl-designer, Implementer, Reviewer) land in M1–M4.

```sh
neutral status   # corpus by stage, coverage gap, change-set readiness
npm test
```
