# LLP 0067: Admission slot consumers at the top of the fleet canvas

**Type:** Spec
**Status:** Accepted
**Systems:** Engine
**Author:** Phil / Codex
**Date:** 2026-08-25
**Related:** 0002, 0045, 0055, 0060

## Summary

The admission semaphore bounds new work, but the mayor's overview canvas does
not show what owns its capacity. Add a work-slots section immediately below the
canvas title so a human can see each repository's capacity and follow every
occupied slot to the work surface that consumes it.

## Rendered view

For each repository, the mayor reads `admission` from that tick's `neutral
observe --json`. It does not reconstruct or recount admission from PR, issue,
branch, or canvas state. The section shows `used/limit` and renders the
authoritative `admission.active` array in order:

- a `pr#N` surface links to the GitHub pull request;
- an `issue#N` surface links to the GitHub issue;
- a `changeset/<slug>` surface links to its `integration/<slug>` branch; and
- a PR or issue also links to its Slack artifact thread when the root already
  exists. A missing root produces no fabricated thread link.

Each configured slot is explicitly accounted for. Occupied slots name their
surface and reason; unoccupied slots say `available`. If active work exceeds a
newly lowered limit, every active surface remains visible and entries beyond the
configured limit are marked `overflow` rather than truncated. A zero limit is
shown as paused with no invented slots.

Frozen surfaces are not rendered as slot consumers because LLP 0060 excludes
them from the semaphore. They remain visible in the canvas sections that explain
waiting and in-flight state.

## Placement and freshness

`Work slots` is the first section after `# neutral fleet`, before fleet health,
waiting, or general in-flight summaries. It is replaced with the rest of the
canvas every tick and carries no memory. Links come from the repository URL and
the mayor's already-derived Slack root map; the canvas is never read back.

## Requirements

- **R1 — authoritative accounting.** Slot ownership is exactly
  `observe.admission.active`; no second admission classifier exists in the mayor.
- **R2 — every slot visible.** Each occupied and available configured slot is
  shown, with over-capacity active surfaces preserved as overflow.
- **R3 — consumers are navigable.** Every occupied slot has a GitHub work-surface
  link and PR/issue thread links are included when grounded in an existing root.
- **R4 — first-glance placement.** Work slots are the first canvas section.
- **R5 — projection only.** The new section follows LLP 0045's full-replace,
  write-only canvas rule.
