# LLP 0063: Retire stale work surfaces from exact PR disposition

**Type:** Issue
**Status:** Active
**Systems:** Engine, Engineer
**Author:** Phil / Codex
**Date:** 2026-08-24
**Related:** 0002, 0009, 0016, 0052, 0060

## Problem

Admission counts persistent Git/GitHub work surfaces, but two disposed surfaces can
survive forever:

- a squash-merged `integration/*` PR can leave a local branch whose design marker
  is absent or predates the Active-on-target convention;
- a closed-unmerged `fix/issue-*` PR can leave its branch while the delegated issue
  remains open.

The first reappears as an unshipped change set. The second remains
`attempt-exists`. Both consume admission capacity even though no worker or open PR
owns them. In HypAware this inflated two live PRs to seventeen active surfaces.

## Required behavior

<a id="exact-head-retirement"></a>
Retirement is derived from PR disposition and exact head identity:

- a merged PR retires an `integration/*` surface when its recorded head OID equals
  the currently observed branch tip;
- a closed-unmerged PR invalidates a `fix/issue-*` attempt when its recorded head
  OID equals every currently observed tip for that branch and no open PR owns the
  head;
- a later push or a divergent local/remote tip remains active; branch-name history
  alone must never retire new work;
- if PR history cannot be observed, fail conservatively toward visible active work.

The disposed fix issue returns to `needs-fix` with `via: closed-pr:#N`, allowing
the reconciler to clean/recreate the conventional branch. Neither disposed surface
consumes `maxActiveWork` capacity. Physical branch deletion remains cleanup, not
the source of truth for whether disposed work is active.

## Coverage

- `@ref LLP 0002 [constrained-by]` — PR state and exact OIDs are observed ground
  truth; there is no retirement ledger.
- `@ref LLP 0009 [extends]` — a closed fix PR is not a resumable attempt.
- `@ref LLP 0052 [extends]` — merged PR history is a shipped fallback for legacy
  integration surfaces.
- `@ref LLP 0060 [extends]` — disposed surfaces are excluded from admission.
