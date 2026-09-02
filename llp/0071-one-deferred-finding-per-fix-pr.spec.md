# LLP 0071: One deferred review finding per fix PR

**Type:** Spec
**Status:** Accepted
**Systems:** Reviewer, Engineer
**Author:** Phil / Codex
**Date:** 2026-09-02
**Related:** 0002, 0008, 0009, 0017, 0028, 0060, 0070

## Summary

Residual review work is currently bundled: triage opens one generic
`neutral:fix` issue for all non-blocking findings from a PR, and Issue-fix turns
that issue into one generic follow-up PR. Replace that bundle with a one-to-one
chain:

```text
one deferred finding -> one neutral:fix issue -> one fix PR
```

Each artifact names the concrete problem and carries enough evidence to
understand and verify it without reconstructing the original review thread.

@ref LLP 0017#all-or-nothing [extends] — the ship-or-stick judgment remains all-or-nothing while the shipped follow-up work becomes finding-granular
@ref LLP 0008 [constrained-by] — every finding-granular issue still rides the existing Issue-fix invariant
@ref LLP 0060#admission-control [constrained-by] — issues are recorded immediately, while each fix branch separately waits for admission

<a id="triage-fan-out"></a>
## Triage fan-out

When every unresolved finding is non-blocking, triage creates one
`neutral:fix` issue per finding. A finding is identified within that triage by
the source PR number, reviewed head SHA, and its order in the last review record.
The issue carries a hidden identity marker so a retry finds the same issue
instead of creating a duplicate:

```text
<!-- neutral-deferred-finding: pr#N <headSHA> finding:<ordinal> -->
```

The issue title is the finding's specific summary, not a generic “residual
findings” label. Its body records:

- the source PR and exact reviewed head;
- severity, file and line or symbol;
- the observed evidence and incorrect or undesirable behavior;
- why it is safe to defer; and
- an observable acceptance condition, normally the regression test that will
  fail before the fix and pass afterward.

Triage creates or recovers every finding issue before completing. It then posts
one PR comment mapping each finding to its issue and appends one head-keyed
marker containing every issue number:

```text
<!-- neutral-triage: <headSHA> #M #N ... -->
```

The existing parser continues to key on the head SHA; the issue numbers are the
human-readable audit trail. The marker is written last, so partial creation is
safe to retry.

<a id="fix-pr"></a>
## Finding-specific fix PR

Issue-fix reads the issue title and full body before dispatching work. One issue
owns one branch and one PR. The PR title is `Fix #N: <issue title>`, and its
concise LLP 0070 body states the concrete problem/evidence and the implemented
solution. Its sole closing trailer is `Fixes #N`; sibling deferred findings are
separate work items, not extra declared scope hidden in the same PR.

The existing proof gate still applies: the worker must reproduce the finding
with a failing-then-passing regression test or mark that individual issue
`neutral:stuck`. A failure to prove one finding does not erase or coarsen its
siblings.

## Requirements

- **R1 — one-to-one fan-out.** Triage creates exactly one issue for each deferred
  finding and records every resulting issue on the source PR.
- **R2 — retry identity.** A partial triage retry reuses an issue with the same
  source PR, head, and finding ordinal.
- **R3 — actionable detail.** Each issue and PR names the finding and carries its
  location, evidence, expected behavior, and verification condition or result.
- **R4 — one-to-one fix scope.** Each issue-fix branch and PR declares exactly one
  deferred-finding issue as its scope.
- **R5 — unchanged safety boundary.** Any true blocker still sticks the source
  PR without creating deferred work; all findings must be non-blocking before
  fan-out begins.
