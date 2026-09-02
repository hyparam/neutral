# Publish a Neutral-authored PR

Use this procedure only when creating a new task, change-set, issue-fix, or
autophagy PR. Reusing an existing PR does not repeat it.

## Prepare the final head

1. In the branch's isolated worktree, invoke the Skill tool with `unslop` and
   pass the actual PR base (`origin/<base>`). This is the final code-changing
   pass before publication.
2. Run the repository's tests and every defined typecheck, lint, and build check
   against the cleaned tree. Use non-mutating check modes. A missing check is
   reported, never invented.
3. Commit the completed implementation and any cleanup, push the final head, and
   verify the remote ref resolves to that commit. A failed cleanup or check means
   no new PR.
4. From the final head, run `neutral pr-stats origin/<base> HEAD`. Use its exact
   `+A / -D lines` output; it derives source-only stats from git and excludes
   tests and the configured LLP directory.

## Write the body

Write this exact human-readable shape:

```markdown
## Feature or issue
<one short paragraph naming the user-visible feature, bug, or maintenance need>

## Solution
<one short paragraph or up to three brief bullets describing the implemented solution>

**Code:** +A / -D lines
```

Keep only concrete information from the issue, request/design, and final diff.
Do not add a test-plan section, implementation diary, exhaustive file list, or
generic boilerplate. For an autophagy PR, the Solution bullets carry LLP 0036's
required reachability proof and may exceed three only when every trim needs its
own compact proof.

For an issue-fix PR, use `Fix #N: <issue title>` as the PR title. The Feature or
issue paragraph names that issue's concrete behavior and evidence; the Solution
states the implemented fix and verification result. One issue-fix PR has one
closing issue and does not absorb sibling deferred findings (LLP 0071).

Append the applicable machine trailer after a blank line:

- task PR: `Task-Id: <id>`
- change-set PR: `Change-Set: <slug>`
- issue-fix PR: `Fixes #<number>`
- autophagy PR: no trailer

Write the result to a temporary body file and create the PR with `--body-file`.
The body file prevents shell quoting from changing Markdown. LLP 0050's
merge-notes block may later be mechanically prepended to a change-set body.
