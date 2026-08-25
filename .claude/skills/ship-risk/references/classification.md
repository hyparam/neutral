# Ship-risk classification

Ship risk is the possibility that this exact change unintentionally affects
users. Code size and architectural reach matter only when they create a path to
user impact.

## Levels

- **Low** — no plausible user-visible regression was found, or the possible
  effect is trivial, narrowly contained, and immediately reversible.
- **Medium** — a plausible regression could affect a bounded set of users in one
  feature or workflow, with straightforward recovery.
- **High** — users could plausibly suffer serious or broad harm: lost access,
  wrong authorization, security or privacy exposure, data loss or corruption,
  incompatible client behavior, outage, or an irreversible action.
- **Unknown** — the path to users or its consequence cannot be established.

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

Write for a product user. After the marker, use at most 80 words and at most
three risk-surface bullets. Each bullet names one surface and says who could
experience what failure under what condition. Use one short evidence sentence;
command lines, file inventories, code walkthroughs, cleared-risk lists, and
rationale stay in `risk.md`.

```markdown
<!-- neutral-ship-risk: <full-head-sha> <level> e<1-5> v1 -->
## Ship risk: `<level>`
**User impact:** <one plain sentence about who could be affected and how>
- **<surface>:** <precise possible user failure and condition>
- **<optional second surface>:** <precise possible user failure and condition>
**Evidence:** <one plain sentence naming the focused check or what is missing>
```

For low risk with no plausible surface, omit the bullets and say so in the user
impact sentence. For unknown risk, say exactly which user-impact path or proof is
missing.

Example:

```markdown
<!-- neutral-ship-risk: 43cd1d28031fd13f2fb9d38a5e8509a9dd736888 medium e4 v1 -->
## Ship risk: `medium`
**User impact:** Session-search users could see missing or misleading paging controls.
- **Paging state:** A failed request could leave “Load more” hidden.
- **Search guidance:** Loading could show advice that is not yet true.
**Evidence:** Focused paging tests passed, including failure paths.
```
