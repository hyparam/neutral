# LLP 0069: Automerge respects the final-head ship-risk threshold

**Type:** Spec
**Status:** Accepted
**Systems:** Engine, Engineer, Reviewer
**Author:** Phil / Codex
**Date:** 2026-08-30
**Related:** 0002, 0019, 0030, 0060, 0061, 0062, 0064, 0065

## Summary

Make `automerge` the single landing-authority switch. When an own PR is
mergeable, green, and reviewed at its current head, an enabled ship-risk gate
obtains the independent, head-keyed record introduced by LLP 0062. If
`automerge` is true, Neutral lands that exact head only when the record is within
`shipRisk.maxAutomerge` with executable evidence. Every other result holds for a
human.

No second enforcement switch is required. `shipRisk.mode: observe` names the
assessment behavior: without automerge authority it observes and holds; with
automerge authority the configured threshold constrains that authority. `off`
retains LLP 0019's explicit risk-gate bypass.

## Configuration and authority

The ordinary low-risk automerge policy is:

```json
{
  "automerge": true,
  "shipRisk": {
    "mode": "observe",
    "maxAutomerge": "low"
  }
}
```

Because `observe` and `low` are the ship-risk defaults, a repository may express
the same policy with only `"automerge": true`. The settings compose:

- `automerge` is the repository owner's sole authority for Neutral to land an
  own PR.
- `shipRisk.mode: observe` requires a final-head assessment before that authority
  may be exercised.
- `maxAutomerge` is the highest assessed level admitted by that authority. `none`
  assesses every final head and holds all of them.
- `shipRisk.mode: off` bypasses assessment and retains the legacy risk-unaware
  terminal for a repository that explicitly chooses it.
- `mergeQueue` selects enqueue instead of direct merge after every gate passes.

The tracked `automerge` opt-in remains the rollout decision. A repository owner
reviews that authority alongside its shadow records and configured threshold;
there is no global observation-count gate because repositories differ in change
volume and a raw count is not evidence that their classifications are trustworthy.

## Deterministic decision

The Engine re-reads the latest marker-signed assessment and accepts it only when
it covers the current head SHA. It then recomputes eligibility from the record's
level and evidence plus tracked configuration; it never trusts the assessor's
prose or a persisted `eligible` claim.

With `shipRisk.mode: observe`, after mergeable, green, and reviewed all hold:

1. No current-head v1 record emits `assess-ship-risk`.
2. `unknown`, evidence below level 4, `maxAutomerge: none`, or a level above the
   configured threshold emits `ready-hold` for a draft and `held` for a ready PR.
3. An eligible record with `automerge: false` also holds; classification does not
   grant landing authority.
4. An eligible record with `automerge: true` emits `merge`, or `enqueue` when
   `mergeQueue: true`.

Every decision after assessment exposes the observed level, evidence,
eligibility, and whether authority plus eligibility permit automerge.
`neutral:approved` keeps its existing meaning—current-head reviewed-clean—and
therefore remains present on assessment, risk hold, merge, enqueue, and queue wait
decisions.

## Failure and queue behavior

Assessment failure leaves no valid record, so the next observation emits
`assess-ship-risk` again and cannot land. A stale record after a push is equally
ineligible. Unknown or insufficient evidence fails closed to a human hold. A
merge or enqueue mutation rejected by GitHub leaves the PR open for fresh
observation.

Queue admission is protected twice: the CLI authorizes only the assessed exact
head, and `neutral enqueue` passes that head as GitHub's `expectedHeadOid`. Once a
real merge-queue entry exists, GitHub owns the in-flight landing and Neutral keeps
the existing `wait` behavior; a later config change does not race the queue with a
dequeue. If GitHub removes an entry, the ordinary exact-head gates are re-derived
before Neutral may enqueue again.

## Scope

The threshold changes only the own-PR terminal, including pushable adopted PRs.
Review-only foreign PRs retain verdict-only terminals. `autophagy/` proposals
retain their permanent human hold and skip ship-risk assessment because they can
never be automerge candidates.

## Consequences

- Low-risk-only automerge requires one authority switch rather than two.
- Repositories without automerge authority retain shadow observation and human
  holds; observation remains the safe default behavior.
- The independent assessment format and user-centered classification remain
  unchanged, so existing current-head v1 records are valid policy inputs.
- Risk ineligibility is a settled human hold rather than `neutral:stuck`: no input
  is missing, and a new head naturally re-opens review and assessment.
