# LLP 0066: Source-grounded Neutral process answers

**Type:** Spec
**Status:** Accepted
**Systems:** Engine
**Author:** Phil / Codex
**Date:** 2026-08-25
**Related:** 0000, 0002, 0039, 0041, 0042, 0052

## Summary

The mayor can report fleet state from Neutral's commands, but its operating skill
does not teach the pipeline, reconciler families, state transitions, or the
distinction between intended and shipped behavior. Add a model-invoked
`neutral-process` skill that grounds process answers in the Neutral source bundled
in the running image.

This is explanation only. The skill does not reconcile repositories, mutate GitHub,
steer loops, or widen the mayor's authority.

## Process-question boundary

A **process question** asks how or why Neutral behaves: its pipeline, reconcilers,
artifacts, state transitions, scheduling, admission, review rungs, autonomy
boundary, or fleet roles. A question that asks only for the current state of a
repository, PR, issue, or session remains an ordinary mayor ground-truth query.

An artifact-specific question may need both: the process skill explains the rule,
then live `neutral * --json`, `gh`, git, transcripts, or panes establish the
artifact's current facts.

## Grounding contract

For every process question, the skill:

1. Locates the **shipped Neutral source**. In the loop image this is
   `/opt/neutral`; `/work/*` contains target repositories and is not the product
   implementation.
2. Reads LLP 0000 for the system map, then follows only the relevant LLPs and their
   `Extended-by`/`Superseded-by` chain.
3. Inspects the current executable source, skill, controller, and tests that realize
   the rule. LLPs establish intent and rationale; shipped code establishes what the
   running version actually does.
4. Uses live target-repository ground truth only when the question concerns a
   particular artifact or fleet state.
5. States any disagreement between documentation and implementation explicitly as
   **intended** versus **currently shipped** behavior. It never fills a gap from
   model memory or a prior tick.

Answers lead with the conclusion, explain the shortest useful artifact/state path,
and cite the governing LLP number plus the current implementation surface. A
question that cannot be resolved from those sources receives an explicit unknown,
not a plausible reconstruction.

> **Extended-by [LLP 0068](0068-mayor-plain-language-and-show-me.spec.md):**
> the same grounded answer is rendered in short, plain language, with `show-me`
> available when a small visual is clearer than prose.

## Invocation and packaging

`neutral-process` is model-invoked: its description names the process-question
branches, and the mayor calls it before answering one. The mayor retains its normal
live-state query path for status-only questions.

The skill is read-only and is installed beside `neutral-mayor` in the container.
Because the image contains a copy of this repository, deploying new Neutral code
updates the process corpus and implementation together.

## Requirements

- **R1 — source before memory.** No process answer relies only on the model's prior
  knowledge of Neutral.
- **R2 — current before historical.** Forward refs and shipped source are checked so
  superseded mechanics are not presented as current.
- **R3 — intent is not implementation.** LLP and source disagreement is surfaced,
  not silently resolved in favor of either.
- **R4 — explanation is read-only.** Invoking the skill authorizes no reconcile,
  relay, mutation, or irreversible act.
- **R5 — one answer can join rule and fact.** Artifact-specific explanations combine
  the sourced process rule with freshly observed repository state.
