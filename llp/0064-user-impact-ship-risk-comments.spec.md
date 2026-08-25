# LLP 0064: User-impact ship-risk comments

**Type:** Spec
**Status:** Accepted
**Systems:** Reviewer
**Author:** Phil / Codex
**Date:** 2026-08-25
**Related:** 0002, 0019, 0030, 0062

## Summary

Make ship risk answer one question in plain language: **could this exact change
unintentionally affect users?** Keep the public PR comment extremely short and
focused on the precise surfaces through which that effect could occur. Preserve
the full technical audit in the head-keyed `risk.md` artifact.

This extends LLP 0062's assessment presentation and classification semantics. It
does not change the marker, evidence threshold, observation-only rollout,
configured automerge ceiling, or the rule that `unknown` fails closed.

## Classification

- **Low:** no plausible user-visible regression, or only a trivial, narrowly
  contained, immediately reversible effect.
- **Medium:** a plausible regression in one bounded user feature or workflow,
  affecting a limited set of users with straightforward recovery.
- **High:** plausible serious or broad user harm, including access,
  authorization, security, privacy, data integrity, client compatibility,
  availability, or irreversible actions.
- **Unknown:** the path to users or its consequence cannot be established.

The level follows plausible unintended user impact. Diff size, module count, and
architectural reach are supporting evidence only; they do not set the level when
they have no path to users. Sensitive code is high when the change can alter user
outcomes on that surface, not merely because nearby code has a sensitive name.

Low and medium still require focused executable evidence at level 4 or 5. High
may be recorded as soon as serious or broad user harm is plausible. Incomplete
inspection or proof produces `unknown`.

## Public record

The v1 marker remains the machine-readable first line. The human-readable body
after it is at most 80 words and contains only:

1. the level;
2. one plain sentence naming who could be affected and how;
3. zero to three precise risk-surface bullets; and
4. one plain evidence sentence.

Each surface bullet states the user-visible failure and the condition that could
trigger it. File inventories, code walkthroughs, raw commands and output,
cleared-risk catalogs, rationale, and before-merge advice stay in `risk.md`.

## Compatibility

The marker remains:

```text
<!-- neutral-ship-risk: <headSHA> <low|medium|high|unknown> e<1-5> v1 -->
```

The Engine continues to parse only that marker, so existing records remain valid
and no deterministic state-machine change is required. New assessments use this
short public form. Observation mode still always holds and never merges or
enqueues.

> **Extended-by [LLP 0065](0065-plain-language-ship-risk-summaries.spec.md):**
> replaces the 80-word cap with a 120–200 word target and requires ordinary
> product language organized around who could be affected, what could happen,
> why the level fits, and what was checked.
