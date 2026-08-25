# Ship-risk classification

Ship risk is the possibility that this exact change unintentionally affects
users. Code size and architectural reach matter only when they create a path to
user impact.

## Levels

- **Low** — users are unlikely to notice a problem. Any possible effect is small,
  limited to a few people, and easy to undo.
- **Medium** — some users could notice a real problem in one part of the product,
  but their access, data, and privacy remain safe.
- **High** — many users could be affected, or even one user could lose access,
  data, privacy, security, or face an action that cannot be undone.
- **Unknown** — there is not enough evidence to say how users could be affected.

Use the highest applicable level. A sensitive surface is high when the diff can
change user outcomes on that surface; mere proximity is not enough.

## Evidence

Record the highest level reached for the critical safety fact:

1. **Claimed** — prose only.
2. **Located** — implementation or an authoritative source was found.
3. **Traced** — the path from the change to users was followed end to end.
4. **Executed** — focused code proved the fact and fails when it is false.
5. **Reproduced** — the real application or a realistic integration proved it.

Low and medium require level 4 or 5. Otherwise classify `unknown`. High can be
recorded as soon as serious or broad user harm is plausible.

Keep the full trace, changed-file accounting, commands, and output in `risk.md`.

## Public comment

Write for a product user. Use 120–200 words and at most four user-impact
bullets. A low result with no plausible user-facing failure may be shorter.
Describe product behavior in ordinary words: who could notice, what they could
experience, when it could happen, why that maps to the level, and what was
checked. Translate implementation details into user experience. Keep file names,
code symbols, commands, test output, architecture terms, and evidence-level jargon
in `risk.md`.

```markdown
<!-- neutral-ship-risk: <full-head-sha> <level> e<1-5> v1 -->
## Ship risk: `<level>`
**Who could be affected:** <people using the affected product area>

**What could happen:**
- <plain description of a possible user-visible failure and when it occurs>
- <optional additional user-visible failure>

**Why this level:** <plain explanation of the likely reach and seriousness>

**What was checked:** <plain summary of the important successful checks or missing proof>
```

For low risk with no plausible surface, say that directly instead of inventing
bullets. For unknown risk, say what could not be checked and why that prevents a
clear answer.

Example:

```markdown
<!-- neutral-ship-risk: 43cd1d28031fd13f2fb9d38a5e8509a9dd736888 medium e4 v1 -->
## Ship risk: `medium`
**Who could be affected:** People searching across many sessions, especially when results arrive in more than one batch.

**What could happen:**
- While results are loading, “Load more” could disappear even though more results are available.
- If a request fails, the page could suggest narrowing the search too early.
- The same behavior appears in both organization search and a single session’s search.

**Why this level:** The problem could make results harder to reach in search, but it would not delete data, reveal private information, or stop other parts of the product. It would be limited to how results are shown, and users could recover by retrying the search.

**What was checked:** Tests covered loading, successful completion, and failed requests. All passed.
```
