# LLP 0065: Plain-language ship-risk summaries

**Type:** Spec
**Status:** Accepted
**Systems:** Reviewer
**Author:** Phil / Codex
**Date:** 2026-08-25
**Related:** 0062, 0064

## Summary

Replace LLP 0064's overly compressed 80-word public record with a middle-length
summary written in ordinary product language. The comment must explain the risk
surface clearly without requiring knowledge of the codebase or software design.

This changes only the human-readable body. The v1 marker, risk levels, evidence
requirements, observation-only rollout, and full private `risk.md` audit remain
unchanged.

## Public comment

Use 120–200 words after the marker and at most four short user-impact
bullets. A low result with no plausible user-facing failure may be shorter. The
summary contains:

1. **Who could be affected:** the people using the relevant part of the product.
2. **What could happen:** concrete problems they might experience and the
   conditions that could cause them.
3. **Why this level:** the likely number of affected users and seriousness of the
   outcome, stated without internal terminology.
4. **What was checked:** the important successful checks, or the missing proof
   that caused an `unknown` result.

Use names that a product user recognizes, such as “sign in,” “search results,” or
“billing.” Translate internal implementation details into observable behavior.
File names, symbols, commands, raw output, architecture labels, evidence levels,
and detailed reasoning stay in `risk.md`.

## Risk language

The public explanation of the level is user-centered:

- **Low:** users are unlikely to notice a problem; any possible effect is small,
  affects few people, and is easy to undo.
- **Medium:** some users could notice a real problem in one part of the product,
  while access, data, and privacy remain safe.
- **High:** many users could be affected, or any user could lose access, data,
  privacy, security, or face an action that cannot be undone.
- **Unknown:** there is not enough evidence to explain how users could be
  affected.

The private classification work may use technical evidence, but the posted
comment expresses the result only in this product language.
