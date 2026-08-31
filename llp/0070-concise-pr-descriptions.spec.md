# LLP 0070: Concise PR descriptions with production-code stats

**Type:** Spec
**Status:** Accepted
**Systems:** Engine, Engineer
**Author:** Phil / Codex
**Date:** 2026-08-31
**Related:** 0002, 0003, 0009, 0036, 0050

## Summary

Neutral-authored pull requests are too verbose. Give every new task, change-set,
issue-fix, and autophagy PR one small description that says what feature or issue
it addresses and briefly explains the solution. Before publication, run the
`unslop` cleanup pass against the final branch, verify the cleaned tree, and show
the size of the production-code diff without tests or LLP documents.

<a id="body"></a>
## Body

The human-readable body has exactly two sections:

```markdown
## Feature or issue
<one short paragraph>

## Solution
<one short paragraph or a small list>

**Code:** +A / -D lines
```

The code line is derived from the final PR diff. It counts added and removed
lines only in source extensions configured by Neutral, excluding the configured
LLP directory, test directories, and `*.test.*` / `*.spec.*` files. Binary files
contribute no lines.

Machine-readable trailers remain after the human-readable body: `Task-Id:` for
task PRs, `Change-Set:` for integration PRs, and `Fixes #N` for issue-fix PRs.
LLP 0050's mechanically maintained merge-notes block may still be prepended to a
change-set PR.

<a id="publish"></a>
## Publish boundary

Once implementation is complete, invoke the bundled `unslop` skill against the
PR's actual base. It is the final code-changing pass. Run the repository checks
on the cleaned tree, commit any cleanup, push the final head, derive the code
stats from that head, and only then create the PR with a body file.

Reusing an existing PR is not publication and does not repeat this procedure.
Later reconciliation may update only mechanically owned body blocks and markers
defined by their own LLPs.

## Requirements

- **R1 — concise shape.** Every new Neutral-authored PR uses the two human
  sections above, with no generated test plan, implementation diary, or generic
  boilerplate.
- **R2 — final cleanup.** `unslop` runs on the completed branch before final
  verification and PR creation, preserving functional annotations and behavior.
- **R3 — derived stats.** Added and removed production-code lines are computed
  from the final git diff against the PR base; tests and LLPs never contribute.
- **R4 — protocol compatibility.** Required trailers, review markers, and LLP
  0050's merge-notes block keep their existing positions and meaning.
