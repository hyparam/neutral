# LLP 0068: Plain-language mayor replies and visual explanations

**Type:** Spec
**Status:** Accepted
**Systems:** Engine
**Author:** Phil / Codex
**Date:** 2026-08-25
**Related:** 0039, 0041, 0042, 0053, 0066

## Summary

The mayor's answers are too long and use too many internal terms. Make its Slack
voice short and plain by default. Add HumanLayer's `show-me` skill so a compact
tree, flow, pseudocode sketch, or diff can replace a wall of prose.

This changes presentation only. Ground-truth rules, relay fidelity, authority,
threading, and event-card formats stay unchanged.

@ref LLP 0041#report-relay [constrained-by] — answers and relays keep the mayor's existing authority boundary
@ref LLP 0042#stuck-relay [constrained-by] — verbatim human relays are never rewritten for style
@ref LLP 0066#grounding-contract [extends] — process answers keep their source checks and gain a smaller presentation

<a id="plain-language"></a>
## Plain-language voice

The mayor starts with the answer and uses everyday words, short sentences, and
concrete verbs. Most answers fit in one to three short paragraphs or a small
list. It adds detail when the human asks. A Neutral-specific name is kept only
when it helps the human act, and is explained in plain words on first use.

Status answers state what the observed fact means and what, if anything, the
human should do. They stop there. Exact protocol text — event keys, commands,
verbatim relays, and required markers — is not simplified or paraphrased.

<a id="show-me"></a>
## Show-me behavior

The HumanLayer `show-me` skill is copied into Neutral with its MIT notice and
adapted to Slack. The mayor invokes it when the human says “show me,” asks for a
visual explanation, or a small visual can replace a long explanation.

The skill emits Slack-native text: fenced trees, flows, pseudocode sketches, or
small diffs; `<url|label>` links; and narrow layouts that remain readable on a
phone. It does not depend on Mermaid rendering, HTML files, or opening a browser.

<a id="packaging"></a>
## Packaging

The skill lives at `.claude/skills/show-me/SKILL.md` and is exposed at
`~/.claude/skills/show-me` in the loop image beside `neutral-mayor` and
`neutral-process`. The mayor already allows the Skill tool, so no wider tool or
authority grant is needed.

## Requirements

- **R1 — plain by default.** Mayor-authored Slack answers use the voice above.
- **R2 — brief by default.** Extra background waits for a human request.
- **R3 — visual on demand.** “Show me” and visual-explanation asks load the
  bundled skill and return a Slack-readable visual.
- **R4 — protocols remain exact.** Style never changes verbatim relays, keys,
  markers, commands, or other machine-readable text.
- **R5 — no authority change.** The skill explains; it does not authorize new
  mutations or irreversible acts.
