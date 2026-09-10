# Finding disposition

@ref LLP 0075#disposition [implements] — resolve existing findings without another broad review
@ref LLP 0075#follow-ups [implements] — automatic repair needs behavioral evidence

1. Read the CLI action, `canFix`, current full head SHA, and latest review.
   Check out that head. Account for every finding in its original order; if
   legacy findings lack ordinals, assign consecutive ordinals from 1.
2. Check each finding's cited location and evidence. Give it one disposition:
   - `fix`: a defect requiring a change in this PR. When `canFix: true`, dispatch
     the normal review-fix worker, verify the committed change and regression
     proof, push, and return to observation. The new head needs review. An
     unsuccessful fix holds with a stuck report instead of repeating triage.
   - `defer`: safe to leave outside this PR. State why. Classify as `defect`
     only with an observed incorrect behavior, expected behavior, and testable
     acceptance condition. Style, names, prose, and speculative cleanup are
     `preference`. Being pre-existing does not itself establish safe deferral.
   - `reject`: the finding is disproven; cite the concrete counter-evidence.
   - `blocker`: unresolved production risk. If `canFix: false`, a required
     current-PR fix is also a blocker. Set `neutral:stuck` and write the stuck
     report; no completion marker or deferred issues while a blocker remains.
3. When only `defer` and `reject` remain, write a JSON array with every finding,
   including rejected ones, preserving ordinals. Each deferral has this shape:

   ```json
   {
     "ordinal": 1,
     "disposition": "defer",
     "kind": "defect",
     "title": "Handle empty input in the legacy parser",
     "severity": "minor",
     "location": "src/parser.js:42",
     "evidence": "parse([]) throws TypeError on the unchanged legacy path.",
     "expectedBehavior": "Empty input returns an empty result.",
     "reason": "This PR never calls the legacy path; the cited call graph shows it remains isolated.",
     "acceptance": "Add an empty-input regression test that fails before the fix and passes afterward."
   }
   ```

   `preference` uses the same fields except `expectedBehavior`. A rejected
   finding needs `ordinal`, `disposition: "reject"`, and `reason` containing
   the counter-evidence. Use concrete evidence from this review, not the example.
4. Run `neutral defer-findings <PR> <full-head-SHA> <file.json>`. It validates
   all entries before creating anything, reuses existing issue identities across
   open and closed issues, and rechecks the head before each creation. Only
   evidenced defects receive `neutral:fix`. Existing human labels survive retries.
   A stale-head failure leaves any created issues reusable and no completion marker.
5. Post a marker-signed `neutral-disposition` comment accounting for every finding:
   its disposition, evidence, and returned issue link where deferred. Re-read the
   head and PR body, then append the existing head-keyed `neutral-triage` marker
   with all issue numbers. When everything was rejected, append it without numbers.
   Do not add a `neutral-review` marker: adjudication does not consume a round.

Completion means every finding has a disposition backed by cited evidence,
every deferral has a real issue, and the triage marker covers the current head.
Preferences remain backlog until a human explicitly delegates them.
