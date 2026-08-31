---
name: unslop
description: Simplify a completed code change without changing its behavior. Use as Neutral's final code-changing pass before a pull request is verified and published.
allowed-tools: Bash, Read, Write, Edit
---

# unslop

Simplify the current worktree against the PR base supplied by the caller,
including its uncommitted implementation. If the caller did not supply a base,
use `main` or `master`. Preserve behavior and the requested scope; this is
cleanup, not redesign.

- Inspect every added comment. Keep only current explanations of why the code is
  necessary. Remove history, removed alternatives, narrated steps, and redundant
  prose. Preserve functional comments and annotations such as `@ref`, lint and
  coverage directives, generated-code notices, and protocol markers.
- Follow each added symbol from definition through every use. Remove it when it
  adds no behavior or useful abstraction; simplify needless indirection.
- Inspect every added guard. Remove unreachable guards and checks already
  guaranteed by the language or type system. When a reachable uncertain failure
  needs handling, fail clearly instead of silently masking it.
- Remove duplication and accidental scaffolding when the simpler form has the
  same behavior. Keep tests and documented requirements intact.

Finish when the diff is materially simpler or no safe simplification remains.
Report the files changed and any area deliberately left alone because simplifying
it could alter behavior.
