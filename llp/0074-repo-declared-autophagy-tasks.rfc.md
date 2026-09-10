# LLP 0074: Repo-declared autophagy tasks — the member registry becomes repo data

**Type:** RFC
**Status:** Draft
**Systems:** Core, Engine
**Author:** Phil / Claude
**Date:** 2026-08-18
**Related:** 0002, 0003, 0011, 0013, 0035, 0036, 0047

## Context

The autophagy family (LLP 0011) has two members: the context recycle (LLP 0013)
and code cleanup (LLP 0036). Both are **built into neutral**. Adding a third
means editing neutral's own source (`AUTOPHAGY_MEMBERS`), its config schema, and
the brief in the reconcile skill — a neutral release per idea, in a repo that is
not the one that wants the work done.

That is the wrong seam. *Which* hygiene work is worth doing on slack capacity is
a property of **the repo**, not of neutral: one repo wants its docs kept honest,
another its fixtures pruned, another its error messages audited. The requirement
(Phil): a repo declares its own autophagy possibilities, and the first one to
build is a **documentation task** (below).

The good news is that the machinery is already member-agnostic, and this is
verifiable rather than hoped-for:

- `lastDisposition()` finds a member's cooldown anchor by **branch prefix**
  (`autophagy/<id>-`), and `github.js` fetches disposed PRs across the whole
  `autophagy/` namespace — neither knows the member set.
- `selectInitiative()` ranks whatever rows the registry hands it, and
  `leastRecentlyRun()` is pure over that breakdown (LLP 0047 §rotation).

Only two things are member-specific today: the registry row (whose `configKey`
is typed to the literal `'codeCleanup'`) and the **brief** — the prose the
orchestrator hands its worker, which lives in neutral's skill.

## Proposal

<a id="tasks-are-data"></a>**A repo declares its autophagy tasks in
`.neutral/config.json`.** The registry becomes the union of neutral's built-ins
and the repo's declarations:

```json
"autophagy": {
  "codeCleanup": true,
  "cooldownAfterMergeHours": 24,
  "cooldownAfterRejectHours": 168,
  "tasks": [
    { "id": "docs", "brief": ".neutral/autophagy/docs.md", "enabled": true }
  ]
}
```

Each task is `{ id, brief, enabled }`. Selection, rotation, cooldowns, the
one-open-PR gate and no-op damping are **untouched** — a declared task is just
another row, and LLP 0047's rotation already treats a never-run member as oldest
so a freshly declared task gets its turn.

<a id="brief-is-a-file"></a>**The brief is a file in the repo, not a config
string.** `brief` is a path (conventionally `.neutral/autophagy/<id>.md`).
Briefs are prose that will grow examples and carve-outs; a JSON string field
makes them unreadable and undiffable, and review of *what the agent was told to
do* is the main safety surface here. A file reviews like code.

<a id="frame-is-neutrals"></a>**The repo supplies the task; neutral supplies the
frame — and the frame is not overridable.** The worker prompt is neutral's
envelope wrapped around the repo's brief. The envelope is every family rule that
already binds cleanup (LLP 0011, LLP 0036): slack-only, **held never merged**,
propose never assert, own worktree off the target branch, branch
`autophagy/<id>-<yyyy-mm-dd>`, evidence in the PR body, repo checks pass, PR
opens as a **draft**, and a no-op is a valid outcome that opens nothing.

This is the load-bearing safety choice. A repo-supplied brief is text that
steers an autonomous agent with a worktree, so its blast radius must stay inside
the envelope every member already has. A brief that says "merge it yourself" or
"skip the tests" changes nothing: the terminal is still a held draft PR a human
disposes of, and the `autophagy/` head is still exempt from the automerge
terminal (LLP 0036). The repo chooses *what to look at*, never *what neutral is
allowed to do with the result*.

<a id="ids-are-branch-safe"></a>**Ids are validated, not trusted.** `id` matches
`^[a-z0-9][a-z0-9-]*$`, must not collide with a built-in id, and must be unique
within the repo. The id becomes a branch name and the key the disposition anchor
prefix-matches on, so a malformed id would silently break a member's cooldown —
it is rejected at config load, where every other schema error already surfaces.

<a id="config-validation"></a>**A broken declaration disables that task; it does
not break the tick.** An unreadable brief path, a bad id, or a duplicate makes
that one task ineligible with a `reason` in the `neutral idle --json` member
breakdown — the same shape the existing off/cooldown/damped reasons use. The
idle tick still runs, and the operator sees why in the breakdown rather than in
a crash.

## The first task: documentation

The first declared task keeps documentation honest, and has two targets.

<a id="drift"></a>**Code-vs-docs drift.** READMEs, guides and usage docs that
contradict the code as it now stands: renamed commands, removed flags, dead
paths, examples that would fail if run. This fits LLP 0036's evidence bar —
each claim is checkable against the tree, and the PR body carries the check.

<a id="docs-signals"></a>**Docs signals — drift and `@ref` backfill, neither
self-satisfiable.** [LLP 0011 §Members](0011-autophagy.rfc.md) admits a member on
a **ground-truth signal**, and every admitted row shares a property worth naming:
the signal is a fact about the world that the member's output must genuinely
change. Dead-code trim cannot fake unreachability. LLP repair's broken `Related:`
is cleared only by repairing it. Coverage backfill writes an `@ref` — but the
**code it annotates already exists**, so the annotation labels real work someone
else did, and a human verifies the label in the diff.

The documentation task takes two signals of that kind:

- **Drift** — a docs file that *contradicts* the tree: a documented flag that no
  longer exists, a command that errors, a path that is gone, an example that
  would fail if run. It is derived from code↔doc disagreement, so no amount of
  fresh prose clears it.
- **`@ref` backfill on docs** — the mirror of 0011's coverage backfill: docs that
  **already describe** a decision but carry no `@ref` to the LLP that decided it.
  The member *labels existing prose*; it never authors prose in order to earn a
  citation.

`.md` is deliberately absent from `config.code.exts`, so a docs `@ref` dimension
can exist without LLPs satisfying the **code** coverage invariant (LLP 0003) by
citing one another — see Rejected. Per LLP 0002 the CLI computes both signals and
the worker only closes them; the member must not be the thing that decides what
counts.

## Open questions

1. **Do the built-ins become declared defaults?** Keeping `codeCleanup` as a
   built-in boolean is backward-compatible and needs no migration; folding it
   into `tasks` makes one code path instead of two. Proposed: keep the built-in,
   add `tasks` alongside, and revisit once a second repo-declared task exists.
2. **Per-member cooldowns.** LLP 0047 deferred these until a member needed them.
   A docs task that no-ops most days may want a shorter cooldown than a cleanup
   that rewrites files. Proposed: defer still — the no-op damping already covers
   the common case.

## Rejected

<a id="rejected-docs-invariant"></a>**"Every Active LLP owes a docs reference."**
The first shape of this task, and the reason the grill happened. It fails LLP
0011's admission test: the member closes the gap by **authoring the very artifact
the signal measures**, so a paragraph citing LLP 0042 turns the gap green while
the documentation gets no better — a self-issued receipt, which is exactly what
LLP 0002 forbids. It also scales the wrong way: the Active set grows
monotonically, so the rule pressures documentation toward a reference dump rather
than prose anyone wants to read. The *goal* (docs move when decisions move)
survives as the drift + backfill signals above.

<a id="rejected-inline"></a>**Briefs inline in `config.json`.** Puts multi-line
prose in a JSON string: unreadable in review, awkward to diff, and it grows a
second place where task text lives once a brief needs an example.

<a id="rejected-plugin"></a>**Repo-supplied executable workers.** Letting a repo
ship a script neutral runs would make the brief arbitrary code rather than
instructions inside a fixed envelope, and would move the safety story from "a
human disposes of a draft PR" to "neutral executes whatever the repo says".
The declarative brief buys the extensibility without that trade.

<a id="rejected-md-in-code-exts"></a>**Just add `.md` to `config.code.exts`.**
The cheap way to make docs count — and wrong: every LLP cites its neighbours, so
the whole corpus would satisfy the *code* coverage invariant by cross-reference
and the Designer backlog would empty itself. The docs `@ref` dimension has to
stay separate precisely because the corpus is Markdown too.

## References

- [LLP 0011](0011-autophagy.rfc.md) — the autophagy family and its slack-only,
  held-never-merged, propose-never-assert rules that the frame enforces
- [LLP 0036](0036-code-cleanup-autophagy.spec.md) — the built-in member this
  generalizes, and the evidence bar the docs task inherits
- [LLP 0047](0047-idle-initiative-throttling.decision.md) — the rotation and
  cooldowns a declared task joins unchanged
- [LLP 0035](0035-idle-initiative-selection.decision.md) — one initiative per
  tick, and the single selection site a declared task must not duplicate
- [LLP 0003](0003-coverage-and-change-sets.spec.md) — the code coverage
  invariant the docs `@ref` backfill signal mirrors
- [LLP 0002](0002-ground-truth.principle.md) — why the CLI computes the docs gap
  and the worker only closes it
