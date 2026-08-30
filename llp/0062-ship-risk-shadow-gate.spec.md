# LLP 0062: Ship-risk shadow gate before automerge

**Type:** Spec
**Status:** Accepted
**Systems:** Engine, Engineer, Reviewer
**Author:** Phil / Codex
**Date:** 2026-08-24
**Related:** 0002, 0007, 0009, 0019, 0028, 0030, 0060

## Summary

Add a final, head-keyed **ship-risk** assessment after an own PR reaches its
reviewed-clean (`neutral:approved`) state. The first release is a shadow gate: it
records which PRs the configured policy would permit to automerge, but always
holds them for a human. A later request may authorize enforcement after the
observations are trustworthy.

Ship risk is not the dual-review risk score. Review asks where to scrutinize and
what to fix; ship risk asks whether Neutral may land this exact final head without
a human. The latter is an authority decision and therefore has a stricter,
proof-carrying contract.

## Configuration

`.neutral/config.json` gains:

```json
{
  "shipRisk": {
    "mode": "observe",
    "maxAutomerge": "low"
  }
}
```

- `mode` is `observe` (default) or `off`. `observe` runs the shadow gate and
  always holds; `off` preserves LLP 0019's legacy terminal behavior. An
  enforcement mode is deliberately not admitted by this spec.
- `maxAutomerge` is `none`, `low`, `medium`, or `high` (default `low`). It is the
  highest assessed risk the future automerge policy would admit. `unknown` is an
  assessment outcome, never a configurable threshold and never eligible.

The existing `automerge` boolean remains the repo owner's authority intent. In
shadow mode `wouldAutomerge` is true only when both that intent is on and the
assessment is within `maxAutomerge`; no merge or enqueue action is emitted.

## Assessment record

The `/ship-risk` worker is independent of the implementer and review-fix workers.
It inspects the final diff in an isolated worktree, identifies the one safety fact
on which landing depends, and gets that fact to executable evidence using the real
code whenever possible. It maps callers, contracts/configuration, concurrency and
sensitive surfaces, but does not derive risk from prose volume or a count of risk
bullets.

One marker-signed PR comment is the assessment record:

```text
<!-- neutral-ship-risk: <headSHA> <low|medium|high|unknown> e<1-5> v1 -->
```

The comment carries the changed surface, critical safety fact, commands and
observed results, confirmed risks, cleared risks, and a concise classification
rationale. `unknown` is required when the final diff cannot be inspected. The
evidence field records the highest proof level reached for the critical safety
fact. A low classification requires all of: bounded internal reach, low
consequence, no sensitive surface, and executable proof against the final head.
No non-unknown level is eligible below evidence level 4, even when the configured
threshold admits that risk.

The Engine re-reads the comment thread and accepts only a record covering the
current head SHA. A push makes the old record stale and re-opens the gate. The
record is an independent observer's structured verdict; the CLI, not the worker,
derives eligibility by comparing its level with tracked configuration (LLP 0002).

## Reconciler behavior

After mergeable, green, and reviewed all hold for an own non-autophagy PR:

1. `shipRisk.mode = off` preserves the existing terminal action.
2. `shipRisk.mode = observe` with no current-head record emits
   `rung=ship-risk action=assess-ship-risk` and `approved=true`.
3. With a current-head record, the CLI emits `ready-hold` for a draft or `held`
   for a ready PR, still with `approved=true`, plus `shipRisk`,
   `shipRiskEligible`, and `wouldAutomerge` fields.

Observation mode never emits `merge` or `enqueue`, at any configured risk. This
is a shadow decision, not merge authority. Review-only foreign PRs and autophagy
PRs retain their existing terminals; queued PRs already owned by GitHub remain a
queue `wait`.

## Risk levels

- **Low:** internal and bounded reach; low, reversible consequence; no auth,
  privacy, data, schema/migration, public contract, dependency/build, deployment,
  infrastructure, or concurrent-lifecycle surface; critical safety fact proven by
  running the real path.
- **Medium:** cross-module or user-visible reach, configuration/API behavior, or
  meaningful operational recovery, with the critical safety fact still proven.
- **High:** security/privacy, data loss or corruption, migrations, public/wire
  compatibility, broad outage, irreversible operations, infrastructure/deployment,
  or subtle concurrent lifecycle risk.
- **Unknown:** incomplete inspection, ambiguous final diff, missing executable
  evidence, or any other condition that prevents an honest classification.

Classification is the maximum applicable level; proof may clear a hypothesized
risk but cannot make an inherently high-consequence surface low.

## Consequences

- Neutral obtains real shadow data before any risk-based merge authority exists.
- `neutral:approved` keeps its LLP 0030 meaning: current-head reviewed-clean. Ship
  risk is a later predicate and never changes the label's meaning.
- The threshold is tracked and reviewable now, so future enforcement changes only
  the terminal action after evidence from observation mode supports it.
- A later enforcement request must define rollout evidence, failure behavior,
  queue interaction, and the exact independent check that authorizes landing. It
  must not silently reinterpret `observe`.

> **Extended-by [LLP 0064](0064-user-impact-ship-risk-comments.spec.md):** risk
> levels are classified by plausible unintended user impact, and the public PR
> comment is a terse surface summary while the full technical audit remains in
> the private assessment artifact.

> **Extended-by [LLP 0069](0069-automerge-respects-ship-risk.spec.md):** keeps
> observation hold-only when automerge authority is off; when it is on, the
> independently assessed exact-head threshold constrains landing.
