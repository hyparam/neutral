# LLP 0083: What a watchdog replace costs the fleet safety budget

**Type:** RFC
**Status:** Draft
**Systems:** Engine
**Author:** Claude, from HypAware recommendation `hyprec-023eb3ce7a3041f7`
**Date:** 2026-10-29
**Related:** 0034, 0072, 0076

@ref LLP 0072 [extends] : records how the accepted failure accounting behaved in three fleet holds and asks whether a verified replace should keep counting
@ref LLP 0034 [constrained-by] : the watchdog's recovery ladder stays gentlest-first

## Problem

Between 2026-09-21 and 2026-10-11 the fleet stopped three times on
`second failure within 60 minutes`, and each stop waited for an operator to
rearm it: about 60 hours from 2026-09-26, about 20 hours from 2026-10-03, and
about 16 hours from 2026-10-07. In two of the three, the second failure was
the watchdog's own `safety replace`. The HypAware recommendation that found
this asked for two things: amend the watchdog's respawn rung (done in the same
change as this document) and establish, from the code rather than from the
operator's reading, what the controller counts before changing it. This
document is that statement. It changes no rule.

## What the controller counts

`src/safety.js` keeps a `failures` list. A `failure` action appends one entry
per run id and holds when the entries inside the rolling hour reach
`SAFETY_POLICY.failuresHour` (2) or inside the day reach `failuresDay` (6).
`docker/safety-controller.js` commits a `failure` in four places:

1. A daemon (`hyp`) that is observed dead, or a replacement daemon that dies
   before readiness.
2. A registered loop observed dead after a gateway recovery ("independent
   deaths are not forgiven").
3. A registered loop observed dead on an ordinary poll.
4. The `replace` operation: the replaced session is recorded as a failure
   whether or not it is still alive. `recycle` records one only when the old
   session is already dead.

This matches LLP 0072's event table, which lists "watchdog replacement of a
wedged loop" beside unexpected exits as one recovery event, and its rationale
that a second recovery inside an hour means the first did not produce
sustained stability. Gateway failures count against the whole fleet by design:
one daemon death is one event, and its consequences for the loops are
coalesced into that wave rather than counted five times.

## The three holds, replayed against that rule

| Hold | Events inside the hour | Rule outcome | Defect |
|---|---|---|---|
| 2026-09-26 to 09-28 | Two `safety replace` calls about 5 seconds apart, output hidden by `tail` (operator's reading) | Two recovery events: hold, as specified | Watchdog re-issued a replace it could not see complete |
| 2026-10-03 to 10-04 | One prior failure event, then `safety replace` of `neutral-hypaware` at 04:14:52Z piped through `tail -20`; the controller counted it 3 seconds later (operator's reading) | Second event: hold, as specified | Replace issued without reading the controller's answer; the first event is not in the recordings |
| 2026-10-07 to 10-08 | Two gateway failures between 22:50Z and 23:04Z, no replace in the window (operator's reading) | Two events: hold, as specified | None in the watchdog; the rule did what LLP 0072 asks |

Single, visible replaces did not hold: 2026-09-23, 2026-09-30, and the
2026-10-08 call that used `; echo "exit=$?"` and returned `held: false`.

Finding: the controller counted what LLP 0072 says it should count. The first
two holds were caused by the watchdog issuing a replace it could not verify and
then issuing another, or issuing one while an earlier event was still inside
the hour. The skill amendment landing with this document removes the duplicate
and makes the controller's answer visible. It cannot prevent a hold like
2026-10-07, which the rule produces on purpose.

## Decision requested

Whether to change the accounting is a design decision on an accepted RFC and is
left to the fleet owner. The options the evidence supports:

1. **Keep the rule as specified.** Watchdog replaces keep counting. Accept that
   one replace plus any other event inside an hour stops the fleet, and rely on
   the amended skill to avoid self-inflicted second events.
2. **Exempt a verified recovery.** A replace whose replacement session is
   observed live within a bounded window (for example 2 minutes) is retired
   from the hour's count. This keeps the protection against replace loops
   while not charging a repair that worked.
3. **Count gateway failures per component.** A daemon death would hold the
   daemon's recovery path, not five healthy loops. This changes the shared
   fleet budget that LLP 0072 chose deliberately.

Nothing here is adopted. If option 1 is chosen, this document moves to
Accepted with that sentence and no code changes. Options 2 and 3 need a new
spec that supersedes the relevant rows of LLP 0072's event table and the
acceptance tests in `test/safety.test.js` that pin `second failure`.

## Success check

Carried from the recommendation: over 30 days, no hold whose preceding action
was a watchdog `safety replace`; every recorded replace followed in the same
tick by a logged exit code and on the next tick by a `healthy` or `held` line;
fleet-wide holds attributable to a repair action: 0.

## Evidence

HypAware team remote, `ai_gateway_messages`, 2026-09-21 to 2026-10-11, Neutral
fleet gateway. Cited turns: the 2026-10-03 replace (session
`3649148d-55ac-4065-8276-5d23353e7d46`, message
`e6f9d36b-a4a4-4556-83d4-a2f269553487`) and the 2026-10-08 controller response
carrying `lastHold a57522d8` (session `c1c4d2a5-72cf-4103-b635-c98bd57a4823`,
message `fb38a302-a798-4236-bc32-a9624157ad82`). Retrieve the recommendation
with `hyp report get hyprec-023eb3ce7a3041f7 --remote hypaware`. Code read on
`main` at `ad05e5d`. The cause attributions for each hold are the operator's
diagnoses in the recordings; the controller's own log was not available to the
report.
