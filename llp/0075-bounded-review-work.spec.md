# LLP 0075: Bound review waiting, disposition, and automatic follow-ups

**Type:** Spec
**Status:** Accepted
**Systems:** Engine, Engineer, Reviewer
**Author:** Phil / Codex
**Date:** 2026-09-10
**Related:** 0002, 0010, 0017, 0029, 0059, 0060, 0071

The September 10 production review audit found 909 waiting-only commands in
one worker, unchanged-head full reviews driven by scope/prose findings, and
expensive review stages. Phil authorized implementing these three fixes.

@ref LLP 0010 [extends] — worker completion waits belong to the harness
@ref LLP 0029 [extends] — unchanged findings receive disposition before another review
@ref LLP 0017 [extends] — triage can run before the cap
@ref LLP 0071 [extends] — preserve finding granularity but gate automatic admission
@ref LLP 0002 [constrained-by] — current git and GitHub evidence determine completion

<a id="waiting"></a>
## Waiting

CLI review workers run through a bounded process runner that buffers a tail of
output and emits one result at completion. Timeout kills the owned process
group and returns failure, never a clean review. Full reports stay on disk.
Background agents use harness completion waits. A shared container PreToolUse
hook changes TaskOutput calls to blocking waits up to 600 seconds and rejects
literal standalone waiting echoes, including numbered variants. Real probes,
redirected writes, and compound shell commands retain their semantics.

The hook preserves existing permissions and HypAware settings. A tool wait
timeout does not restart the task. External CI remains a next-tick observation.
This removes the observed echo path; it is not a general token quota or a
claim that arbitrary agent tool use cannot waste tokens.

<a id="disposition"></a>
## Disposition before another review

After mergeability and CI, the latest `findings` review at an unchanged head
routes to `triage` immediately, without marking it approved. New heads still
follow the existing review cap. The CLI exposes `canFix` when another review
round remains, including human grants. Review-only foreign PRs retain their
existing contributor-verdict flow.

An independent triager inspects the existing findings and targeted evidence.
Every finding becomes `fix`, `defer`, `reject`, or `blocker`. With `canFix`, a
required fix is attempted and verified; changed code returns to review. An
unresolved blocker or failed fix holds with the existing stuck report. A
pre-existing defect exposed by this PR remains a possible blocker.

Only all-deferred/rejected findings may receive the existing triage completion
marker after actual issue creation and fresh-head verification. Rejections
carry counter-evidence and need no issue. Disposition never writes another
review-round marker. Ship-risk and merge authority are unchanged.

<a id="follow-ups"></a>
## Follow-up admission

Each safely deferred finding still gets its own issue and existing identity
marker. Only a behavioral defect with observed evidence, expected behavior,
and an observable acceptance condition receives `neutral:fix` automatically.
Preferences become ordinary backlog; a human can explicitly delegate them.
Existing issues and human labels are preserved. Existing auto-labelled backlog
is not retroactively changed by this release.

`neutral defer-findings` validates the complete input before mutations,
checks the current open PR head, searches all issue states for existing
identities, and checks the head before every creation. Partial retries reuse
issues. The worker records all dispositions and writes completion last.
Semantic judgment remains the independent triager's responsibility; field
validation cannot prove that its evidence or classification is correct.

<a id="validation"></a>
## Validation

- A slow real worker returns one result; failures and timeouts cannot approve.
- Numbered echo variants are denied; TaskOutput waits block and keep the task ID.
- Hook installation is idempotent and retains unrelated settings.
- Unchanged findings select triage; new heads, pending CI and review-only PRs
  retain their gates; the cap controls `canFix`.
- Preferences create unlabelled issues, evidenced defects get `neutral:fix`,
  and rejected findings create none. Missing evidence fails before any write.
- Stale heads stop creation; partial retries reuse open or closed issues.

Compare stage output and cache-read tokens separately over a subsequent usage
window. Regression tests establish behavior, not a measured production saving.
