# LLP 0078: Incremental re-review after changes

**Type:** Spec
**Status:** Accepted
**Systems:** Engine, Reviewer
**Author:** Phil / Codex
**Date:** 2026-09-17
**Related:** 0002, 0009, 0028, 0029, 0059, 0075

The September 17 token audit found that re-reviews inconsistently reuse prior
work: hypaware-server PR #774 reread the full PR, while #814 explicitly reviewed
only the repair delta. Phil requested incremental re-review as the default.

@ref LLP 0009 [extends] — changed heads require review, with incremental scope
@ref LLP 0028 [extends] — the same review comment records baseline and scope
@ref LLP 0029 [constrained-by] — every round counts and retains its verdict
@ref LLP 0059 [constrained-by] — scope does not grant additional rounds
@ref LLP 0075#disposition [extends] — reuse prior findings after a changed head
@ref LLP 0002 [constrained-by] — compare observed committed trees

<a id="baseline"></a>
## Baseline and scope

For own and fully adopted PRs, an eligible `review` action exposes
`previousReviewSha` from the latest observed review record, whether that record
was clean or had findings. First reviews have no baseline and cover the full PR.
The field is a pointer to evidence, not proof of ancestry or prior coverage.
Review-only foreign PRs retain their existing contributor-verdict flow.

The worker verifies the previous report and commit, current head, and ancestry.
It compares the previous reviewed tree with the current tree, verifies previous
fixes, carries unresolved findings forward, and inspects affected interactions.
Every nested reviewer inherits the same scope. Unsupported incremental modes
in external review skills are replaced with explicitly scoped reviewers from
the same required model families, preserving reviewer independence.

Missing prior evidence, rewritten history, retargeting, or broad invalidation
from a redesign or conflict resolution requires a full review. Local effects
require only local expansion. The worker records the reason before expanding.
A changed SHA by itself is never a full-review justification.

<a id="record"></a>
## Evidence and limits

The existing head-keyed review comment records full or incremental scope,
the previous review link and SHAs, prior finding outcomes, new findings, tests,
and reasons for expansion. The marker format and round counting are unchanged:
an incremental round consumes one round. Outstanding findings cannot be erased
by a clean delta. A moved head returns to observation; approval, triage,
ship-risk, and merge authority retain their current gates.

The CLI exposes the baseline deterministically; the skill controls review
behavior. It cannot mechanically prove which code a model examined.

## Validation

- First reviews omit the baseline; changed heads expose the latest clean or
  findings record, including legacy markers, without claiming git verification.
- Unchanged findings, pending CI, exhausted rounds, and foreign review-only
  actions retain their existing decisions and do not dispatch incremental work.
- A worker checks a simple repair delta and prior findings; a missing report or
  non-ancestor baseline falls back to a full review with a recorded reason.
- Retargeting and invalidated assumptions widen scope; nested helpers inherit
  the comparison and only one round marker is posted.

Production token savings must be measured after deployment; unit checks do not
establish a savings percentage.
