# Neutral process source map

Read only the route that matches the question, plus forward references discovered
there. LLPs explain the contract and rationale; the listed implementation surfaces
show what the installed version executes.

## Whole-system purpose and neutral state

- LLPs: `0000-neutral.explainer.md`, `0001-reconciler-architecture.decision.md`,
  `0002-ground-truth.principle.md`, `0008-neutral-state-and-reconciler-families.decision.md`
- Implementation: `src/state.js`, `src/commands/observe.js`, `src/types.d.ts`,
  `bin/neutral.js`, `.claude/skills/neutral-reconcile/SKILL.md`

Use for “what is Neutral,” why it is declarative, what neutral state means, and how
the pipeline and maintenance families relate.

## LLP intake, coverage, designs, and plans

- LLPs: `0003-coverage-and-change-sets.spec.md`,
  `0015-immutable-llps.decision.md`, `0016-design-first-intake.decision.md`
- Implementation: `src/llp.js`, `src/refs.js`, `src/coverage.js`,
  `src/implementable.js`, `src/commands/backlog.js`,
  `.claude/skills/neutral-reconcile/SKILL.md`
- Tests: `test/llp.test.js`, `test/coverage.test.js`,
  `test/implementable.test.js`

Use for how requests enter, what counts as coverage, grouping into change sets,
design-first intake, and why accepted LLPs are not edited in place.

## Tasks, ready queue, fan-out/fan-in, and admission

- LLPs: `0003-coverage-and-change-sets.spec.md`,
  `0010-execution-model.decision.md`, `0012-main-checkout-isolation.decision.md`,
  `0033-done-requires-work-parentage.decision.md`,
  `0051-deleted-task-ref-fallback.decision.md`,
  `0052-observe-command.decision.md`,
  `0060-admission-control-and-merge-queue.decision.md`
- Implementation: `src/tasks.js`, `src/ready.js`, `src/changesets.js`,
  `src/admission.js`, `src/commands/observe.js`,
  `.claude/skills/neutral-reconcile/implement-changeset.workflow.js`,
  `.claude/skills/neutral-reconcile/SKILL.md`
- Tests: `test/tasks.test.js`, `test/ready.test.js`, `test/changesets.test.js`,
  `test/admission.test.js`, `test/maintenance-commands.test.js`

Use for task dependency state, verified completion, worktree isolation, concurrency,
integration branches, active-work limits, and why eligible work may wait.

## PR health, review, stuck state, and landing

- LLPs: `0009-maintenance-reconcilers.spec.md`,
  `0017-triage-at-review-cap.decision.md`, `0018-self-clearing-blocked-prs.rfc.md`,
  `0019-automerge.decision.md`, `0026-stuck-report.decision.md`,
  `0027-comment-unstick.decision.md`, `0029-verdict-carrying-review-rounds.decision.md`,
  `0058-adopted-prs-are-own.decision.md`, `0059-review-round-grants.decision.md`,
  `0060-admission-control-and-merge-queue.decision.md`,
  `0061-explicit-merge-queue-enqueue.decision.md`,
  `0062-ship-risk-shadow-gate.spec.md`,
  `0069-automerge-respects-ship-risk.spec.md`
- Implementation: `src/prhealth.js`, `src/commands/prs.js`,
  `src/commands/enqueue.js`, `.claude/skills/neutral-reconcile/SKILL.md`,
  `.claude/skills/ship-risk/SKILL.md`
- Tests: `test/prhealth.test.js`, `test/maintenance-commands.test.js`,
  `test/enqueue-command.test.js`

Use for rung precedence, head-keyed evidence, review/fix caps, stuck/unstick,
human hold versus automerge, merge queues, adoption, and ship-risk gating.

## Issue fixes and maintenance intake

- LLPs: `0008-neutral-state-and-reconciler-families.decision.md`,
  `0009-maintenance-reconcilers.spec.md`, `0043-issue-push-events.decision.md`,
  `0060-admission-control-and-merge-queue.decision.md`
- Implementation: `src/issuefix.js`, `src/commands/issues.js`,
  `src/admission.js`, `.claude/skills/neutral-reconcile/SKILL.md`
- Tests: `test/issuefix.test.js`, `test/maintenance-commands.test.js`,
  `test/admission.test.js`

Use for `neutral:fix`, regression proof, attempt branches, issue stuck state, and
how issue work consumes admission.

## Runtime, fleet roles, recovery, and mayor authority

- LLPs: `0010-execution-model.decision.md`, `0013-context-autophagy.spec.md`,
  `0014-per-repo-session-name.decision.md`, `0034-watchdog-loop.decision.md`,
  `0039-mayor-fourth-loop.decision.md`, `0040-slack-socket-bridge.decision.md`,
  `0041-mayor-authority.decision.md`, `0042-slack-bridge-protocol.spec.md`,
  `0057-outage-sentinel.decision.md`
- Implementation: `docker/entrypoint.sh`, `docker/slack-bridge.js`,
  `docker/outage-sentinel.js`, `.claude/skills/neutral-watchdog/SKILL.md`,
  `.claude/skills/neutral-mayor/SKILL.md`, `Dockerfile`
- Tests: `test/slack-bridge.test.js`, `test/silence.test.js`

Use for one loop per repo, ticks and context recycling, converge/heal/converse,
Slack transport, authority boundaries, and deterministic supervision.
