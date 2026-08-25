---
name: ship-risk
description: Assess whether an exact reviewed PR head could unintentionally affect users, prove the key safety fact, classify ship risk as low/medium/high/unknown, and post a terse marker-signed shadow record. Use for Neutral's `assess-ship-risk` action or a requested final pre-merge ship-risk assessment; this skill observes and records but never merges.
allowed-tools: Bash, Read, Write, Grep, Glob
---

# ship-risk

Assess the **exact final head** and leave one auditable shadow-gate record. This
is an independent observer: inspect and run proofs, but do not fix code, push,
label, ready, enqueue, or merge the PR.

Invocation:

```text
/ship-risk <pr-number> <expected-head-sha>
```

The expected SHA is mandatory when called by Neutral. A standalone human call may
omit it; resolve the current `headRefOid` once and treat that as expected.

## Run

1. Read PR metadata and comments with `gh pr view`. Resolve the base, current full
   head SHA, diff, and changed-file list. Stop without posting when the supplied
   expected SHA no longer names the current head; the next reconcile tick will
   classify the new head.
2. If the thread already has a valid v1 ship-risk marker for the current head,
   return it without posting another. Work from a clean checkout detached at the
   exact head. When the caller did not provide an isolated worktree, create a
   temporary detached worktree and remove it on completion.
3. Create the report under
   `$(git rev-parse --git-common-dir)/ship-risk/pr-<N>/<full-head-sha>/risk.md`.
   Keep proof scripts and other scratch artifacts beside the report or under a
   temporary directory, never in the tracked tree.
4. Read [references/classification.md](references/classification.md). Account for
   every changed file privately. Trace callers, contracts, configuration,
   dependencies, and lifecycles far enough to identify the precise surfaces
   through which this change could unintentionally affect users. Identify the
   **critical safety fact** on which unattended landing depends.
5. Prove that fact with the real current-head code. Prefer an existing focused test;
   otherwise run a minimal ephemeral script importing the shipped implementation.
   Record the command, exit status, and concise observed output. A general green
   suite alone is not proof of a specific safety fact.
6. Classify from plausible unintended user impact using the reference rubric.
   Use `unknown` when inspection is incomplete or the critical fact lacks
   executable evidence. Put the full trace, file accounting, commands, and
   observed output in `risk.md` before posting.
7. Immediately re-read the PR head. Post only if it still equals the expected SHA.
   Draft the public body in plain product language. Use 120–200 words with at
   most four user-impact bullets; a low result with no plausible user-facing
   failure may be shorter. Revise until a reader needs no code or architecture
   knowledge to understand who could be affected, what they could experience,
   when it could happen, and what was checked. Post exactly one comment whose
   first line is:

   ```text
   <!-- neutral-ship-risk: <full-head-sha> <low|medium|high|unknown> e<1-5> v1 -->
   ```

   Follow it with only the plain-language public summary from the reference
   template. Keep the technical audit in `risk.md`.

## Completion

Success means the PR thread contains one v1 marker-signed assessment for the exact
current head, its public body is plain and user-focused, and the report file
contains the same classification and full evidence. Stale-head exit, tool failure,
or missing proof leaves no optimistic record; if an assessment must still be
recorded, classify it `unknown` with the observed failure.
