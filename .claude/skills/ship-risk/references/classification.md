# Ship-risk classification

Classify **reach**, **consequence**, and **evidence** separately. The final level is
the maximum applicable reach or consequence level. Evidence may clear a suspected
path; it cannot downgrade an inherently high-consequence surface.

## Reach

- **Low** — one internal module or bounded call path; no external contract,
  configuration propagation, shared lifecycle, or cross-package invariant.
- **Medium** — multiple modules or user-visible paths; internal API/configuration
  behavior; a dependency edge or async lifecycle with bounded ownership.
- **High** — cross-service or cross-language behavior; public API, serialized/wire
  format, schema/migration, shared mutable concurrency, build/dependency graph,
  deployment or infrastructure behavior.

## Consequence

- **Low** — bounded, reversible incorrect behavior with no security, privacy, data,
  availability, or operational recovery concern.
- **Medium** — material user-facing regression, performance regression, or an
  operational incident requiring deliberate recovery.
- **High** — authentication/authorization, secrets/privacy, data loss or corruption,
  irreversible mutation, migration failure, public compatibility break, broad
  outage, unsafe deployment/infrastructure, or subtle concurrent lifecycle failure.

These are **sensitive surfaces** and therefore at least high unless the diff is
demonstrably non-behavioral: auth and permissions; secret or personal data;
database schemas and migrations; destructive/irreversible operations; public,
wire, or cross-language contracts; package/lockfile/build/CI changes; deployment
and infrastructure; shared mutable state and background lifecycle management.

## Evidence

For every fact on which safety depends, record the highest achieved level:

1. **Claimed** — prose only.
2. **Located** — cited implementation or upstream source.
3. **Traced** — the bad case was followed end-to-end and shown not to reach.
4. **Executed** — a focused test or script ran the real current-head code and
   fails loudly if the fact is false.
5. **Reproduced** — exercised in the running application or realistic integration.

The critical safety fact must reach level 4 for `low` or `medium`. Otherwise the
result is `unknown`, not a rounded-up risk level. A high classification may be
recorded immediately when a high surface is present, but any future automerge
eligibility still requires the report to name executable evidence. Search results
and a green general suite are supporting evidence, not substitutes for the focused
proof.

## Decision rules

- **Low** requires low reach, low consequence, no sensitive surface, full changed-
  file accounting, and level-4-or-better proof of the critical safety fact.
- **Medium** requires no high surface or consequence, full accounting, and
  level-4-or-better proof.
- **High** applies when any high reach, consequence, or sensitive surface applies.
- **Unknown** applies when the diff, callers, lifecycle, contracts, or proof cannot
  be completed honestly. Unknown is never automerge-eligible.

Use confirmed facts, not the number of bullets, diff size, or confidence-flavored
adjectives. A one-line authorization bypass is high; a large generated snapshot may
be low only if its generation and consumers are proven.

## Comment/report template

````markdown
<!-- neutral-ship-risk: <full-head-sha> <level> e<1-5> v1 -->
## Ship risk: `<level>`

**Head:** `<full-head-sha>`
**Base:** `<base-ref-or-sha>`

### What changed
- <behavioral change and non-obvious effect, with file:line>

### Surface
- **Files accounted for:** <every changed file or grouped generated set>
- **Callers/contracts/config:** <direct and non-grep edges>
- **Concurrency/lifecycle:** <classification or “none” with evidence>
- **Sensitive surfaces:** <list or “none”>

### Critical safety fact
<one precise falsifiable sentence>

**Evidence level:** <1–5>
**Proof:** `<command>` → exit `<status>`

```text
<concise observed output>
```

### Confirmed risks
- <how it breaks, likelihood, consequence, file:line, and detection>

### Cleared
- <risk investigated, evidence that clears it>

### Rationale
<reach + consequence + evidence → classification; state `unknown` plainly when applicable>

### Before merge
- <cheapest durable check that catches the real failure>
````

Use `None found after the checks above` when a section is empty; never omit a
section or manufacture a concern to fill it.
