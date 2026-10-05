# Incremental re-review

@ref LLP 0078 [implements] — changed heads reuse verified review evidence

Use this procedure when `action: review` includes `previousReviewSha`. The
existing round cap, reviewer independence, finding dispositions, and final-head
ship-risk gate still apply.

1. **Verify the baseline.** Read the latest marker-signed review comment in full,
   including its numbered findings and linked evidence; follow earlier review
   links when this baseline was itself incremental. Match its marker to
   `previousReviewSha`; resolve that value and the observed current head to full
   commit SHAs. Fetch missing objects once. Verify with
   `git merge-base --is-ancestor <previous-reviewed-SHA> <current-head-SHA>`.
   A legacy bare marker without the underlying review is insufficient evidence
   for incremental coverage. Establish that the PR target is unchanged from the
   previous report or GitHub's base-change history; an unknown or changed target
   requires full review. If the head or latest record changed since the CLI
   observation, return to observation before dispatch.
2. **Set the scope.** With a verified baseline, use
   `git diff <previous-reviewed-SHA> <current-head-SHA>` — the two committed
   trees, not the whole PR against its target. Read enough surrounding code,
   callers, tests, and applicable LLPs to assess the delta's effects. Account for
   each prior finding: verify claimed fixes in the committed tree and with
   targeted regression evidence; carry unresolved findings forward; retain
   supported deferrals/rejections unless the delta invalidates their evidence.
   Prior settled conclusions stand where their assumptions still hold. An empty
   delta needs verification of that fact and outstanding findings, not another
   broad scan.
3. **Widen from evidence.** Expand to affected interactions when the delta changes
   an interface, invariant, or dependency used by otherwise unchanged code.
   Use a full PR review when the previous commit/report is unavailable, history
   was rewritten so ancestry cannot be verified, the PR was retargeted, or a
   redesign or conflict resolution invalidates the earlier review broadly.
   A merged target update is part of the delta; inspect its integration effects
   and widen only as needed. A new head SHA alone is not a reason to start over.
   Record the concrete reason and expanded files/invariants before doing the
   additional work. A broad scan that happens to find something is not a scope
   justification after the fact.
4. **Dispatch that scope explicitly.** Give every reviewer the exact previous
   and current SHAs, previous review link and findings, delta command, and any
   justified expansion. Require nested reviewers to inherit them. For an
   incremental round, invoke `code-review` / `dual-review` only through a mode
   that honors this comparison. If the available skill defaults to the whole PR
   or silently starts broad nested reviews, use explicitly scoped reviewers
   from the same required model families instead. Tool limitations alone do not
   authorize a full re-review. Preserve independent verification and one
   marker-signed round; nested helpers do not post additional round markers.
5. **Record and re-observe.** The normal `neutral-review` comment still names the
   full head SHA actually reviewed and counts as one round, including an
   incremental round. Its prose states `Scope: incremental <previous>..<head>`
   (or `Scope: full — <reason>`), links the previous review, lists each prior
   finding's verified outcome, new findings, tests, and any expanded scope.
   `clean` requires both no new actionable findings and every prior finding
   fixed with evidence or safely disposed of; unresolved findings cannot become
   clean merely because the delta introduced none. If fixes are pushed, record
   the reviewed pre-fix head as usual and return to observation. Recheck the
   current PR head before publication; concurrent head movement returns to
   observation and never receives a marker for unreviewed code.

Completion means the delta and affected interactions have been reviewed,
every prior finding is accounted for, and the recorded scope is backed by the
actual git comparison. Incremental review is an instruction contract, not a
claim that the CLI can verify what a model read.
