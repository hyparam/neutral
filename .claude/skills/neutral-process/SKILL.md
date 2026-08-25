---
name: neutral-process
description: Explain how Neutral actually works from its shipped LLPs, source, skills, and tests. Use for questions about Neutral's pipeline, reconciler roles, artifacts, state transitions, scheduling, admission, review rungs, authority boundaries, or why a current artifact is in a particular state. Do not use for a status-only fleet query with no process question.
allowed-tools: Bash, Read, Grep, Glob
---

# neutral-process

Answer process questions from the Neutral version that is actually installed. This
skill is **read-only**: do not reconcile a repo, mutate git or GitHub, steer a pane,
or relay a message.

## Locate the product source

Use `/opt/neutral` when it contains `llp/0000-neutral.explainer.md`; that is the
source baked into the loop image. Otherwise use the current repository root only
when its `package.json` names `neutral`. If needed, resolve the `neutral` executable
symlink back to its package root.

Never treat `/work/<repo>` as Neutral's implementation merely because it has
`.neutral/` configuration or LLPs. Those are target-repository ground truth.

## Ground the answer

1. Read `llp/0000-neutral.explainer.md` from the product source for the system map.
2. Classify the question and read the matching route in
   [references/process-map.md](references/process-map.md). Read the named LLPs,
   then follow relevant `Related:`, `Extended-by:`, `Superseded-by:`, and inline
   forward references. Prefer Accepted/Active documents and say when a Draft is
   only proposed behavior.
3. Inspect the current implementation surfaces named by the route. Search for the
   relevant command, classifier action, state field, skill instruction, and tests;
   do not stop at prose when the question asks what Neutral **actually** does.
4. For a named repo, PR, issue, change set, or session, separately derive its
   present facts from the target clone using the narrowest relevant read:
   `neutral observe --json`, a family command, git, `gh`, transcript, or pane.
   The product rule and the artifact's state are separate evidence.
5. If LLP intent and shipped implementation differ, label both explicitly. If the
   sources do not establish an answer, say `unknown` and name the missing evidence.

Do not use prior conversation, a previous tick, Slack cards, the channel canvas,
PR prose summaries, or an agent's completion claim as the factual basis when the
underlying source or ground truth is available.

## Answer the human

Lead with the direct answer. Then give the shortest useful path through the
relevant artifacts or states and the reason for each transition. Cite governing
LLPs as `LLP NNNN §anchor-or-heading` and name the current implementation surface
(for example `src/prhealth.js` or `/neutral-reconcile`). Avoid dumping internal
detail that does not help answer the question.

For an artifact-specific “why” question, finish by connecting the general rule to
the freshly observed facts for that artifact. Never imply that reading this skill
authorizes an action.
