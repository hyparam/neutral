# LLP 0073: Prefer an available merge queue and support ordinary merging

**Type:** Spec
**Status:** Active
**Systems:** Engine, Engineer, Reviewer
**Author:** Phil / Codex
**Date:** 2026-09-08
**Related:** 0002, 0019, 0060, 0061, 0069

## Problem

Both hypaware-server and hypscope configure `mergeQueue: true`, but GitHub
reports `isMergeQueueEnabled: false` for their open PRs. Neutral treats the
preference as proof of availability, skips base healing, and repeatedly selects
an enqueue that cannot succeed.

@ref LLP 0060#merge-queue [extends] — resolve queue preference against GitHub
@ref LLP 0061 [extends] — explicit enqueue remains the available-queue executor
@ref LLP 0019 [constrained-by] — automerge authority and upstream gates still apply
@ref LLP 0069 [constrained-by] — direct fallback retains exact-head ship-risk gates

<a id="queue-observation"></a>
## Queue observation

`mergeQueue: true` becomes a preference for an available target-branch queue.
The existing default and explicit `false` retain ordinary merge handling.
When the preference is enabled, observe the PR's `isMergeQueueEnabled` and
`mergeQueueEntry` together through GraphQL on every observation. Capability is
per PR target, including adopted PRs and targets other than the default branch.
Bind this read to the health observation's head SHA and target branch.

- A confirmed queue uses the existing queue ladder and explicit enqueue command.
- A confirmed absent queue uses the ordinary ladder described below.
- A failed, partial, malformed, missing, or head/base-mismatched observation is
  unknown: emit `wait` and retry on the next observation. Unknown never authorizes
  a direct merge or speculative enqueue.
- Existing queue membership remains GitHub-owned work: emit `wait` with approval
  intact even if queue capability has changed.

The stuck and review-only classifiers retain precedence. Availability is an
independent GitHub observation, never inferred from an enqueue error, repository
auto-merge settings, or an agent-written ledger.

<a id="ordinary-landing"></a>
## Ordinary landing

On a confirmed queue-less target, `BEHIND` once again requires mechanical base
healing. Current-head CI, review, and ship-risk gates run as usual after any push.
A reviewed-clean, risk-eligible own or pushable adopted PR emits `merge` only with
`automerge: true`; otherwise it retains the human hold. Autophagy and review-only
delegations keep their existing authority boundaries.

The reconcile worker executes direct squash merges with
`gh pr merge <N> --squash --match-head-commit <headSha>`. After marking a draft
ready, re-observe before landing. GitHub still enforces branch protection; a
rejection leaves the PR open for fresh observation. An enqueue failure likewise
returns to observation instead of directly falling back inside the mutation.
Completion remains independently observed merged state.

## Verification

Offline observer tests cover available and absent queues, ordinary base healing,
unchanged risk/review/authority gates, mixed targets, adopted PRs, capability
changes, existing membership, failed and malformed reads, and head/base races.
Read-only production observation verifies the same query against both affected
repositories without enqueuing or merging their PRs.
