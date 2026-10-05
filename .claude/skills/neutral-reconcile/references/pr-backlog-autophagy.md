# PR backlog relevance audit (LLP 0079)

Run only when `neutral idle --json` selects `initiative: "pr-backlog"`.
Dispatch one judgment-tier worker in its own worktree off the configured target
branch, on `autophagy/pr-backlog-<yyyy-mm-dd>` (add a unique suffix on collision).
Give it the complete `prBacklog` observation and this brief.

1. **Observe intent and remaining work.** For every listed PR, read the body,
   linked issue/LLPs, reviews and discussion, exact head/base SHAs and current
   diff. Inspect the current base tree and relevant merged and open replacement
   PRs. Paginate searches; list anything unassessed if a work budget is reached.
   Treat inaccessible or failed reads as uncertainty, never proof of absence.
2. **Assess relevance.** Assign each PR one of:
   - `still-needed`: name the unmet requirement and unique remaining behavior.
   - `already-implemented`: cite current-base code/commits and checks showing all
     intended behavior already exists. Account for every meaningful diff part;
     inspect squashed implementations instead of relying only on ancestry.
   - `superseded`: map its intent to a cited replacement. If the replacement is
     still open, recommend keeping the original until the replacement lands.
   - `irrelevant`: cite a newer explicit decision or removed feature that makes
     the original request inapplicable, and account for useful remaining changes.
   - `uncertain`: name the missing evidence or concrete human choice.
   Age, inactivity, conflicts, CI failures and similar titles are not closure
   evidence. Partial overlap calls for salvaging the unique remainder. Inspect
   stacked PRs, linked issues and LLP coverage/dependency edges before recommending
   closure. Verify cross-repo replacements in their own repo, or mark uncertain.
3. **Prepare the proposal.** If there are actionable recommendations, write
   `reports/pr-backlog/<yyyy-mm-dd>.md` (add a suffix if that file exists).
   Use this tracked report directory because `.neutral/*` is normally ignored.
   Include observation time,
   inventory fingerprint, scope and unassessed PRs, then a row per assessed PR:
   link, head/base SHAs, verdict, evidence links and reproducible checks,
   remaining useful work, dependents, and recommended human action. Explain
   proposed closures individually. The report is advisory; its merge changes no
   PR state and never counts as completing a request. If all PRs remain needed
   and no action is warranted, produce no PR.
4. **Verify freshness and publish.** Re-run `neutral idle --json` preserving
   other members' current `--damped` hints, but omitting `--backlog-snapshot`.
   Confirm the audit is still selected and the inventory fingerprint
   matches the assessed one; re-read any external evidence cited by the report.
   On changes, refresh the affected judgments before publishing, or defer.
   Run the repo's checks and follow [PR publishing](pr-publishing.md).
   Open one draft report PR. It stays held under the `autophagy/` policy.

Keep the assessed PRs, their labels, comments, branches and accepted LLPs unchanged.
Closing a PR requires a separate human instruction; the report is the reviewable
proposal. If no report is warranted, return a complete no-op with the fingerprint.
An incomplete/failed scan returns that status and the unassessed list instead.

On fan-in, verify any report PR via `gh`. Emit
`tick: family=autophagy action=pr-backlog detail=pr#<N> assessed=<n> unassessed=<n>`.
For a complete no-op emit `action=pr-backlog-noop` with the fingerprint and count;
retain the fingerprint as a session scheduling hint and pass it on subsequent
`neutral idle` calls as `--backlog-snapshot <hash>`. The CLI automatically releases
the hint when PRs or bases change. For incomplete/failed scans log
`action=pr-backlog-incomplete` or `action=pr-backlog-failed`; retain no no-op hint.
Return and let the loop schedule its next tick.
