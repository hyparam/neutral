# Neutral

Neutral's system map and reconciler vocabulary live in
[LLP 0000](llp/0000-neutral.explainer.md). This glossary records additional
operational terms used by the safeguard in LLP 0072.

## Language

**Loop fleet**:
The repo reconcile loops, watchdog, and mayor belonging to one Neutral
deployment. Capture and messaging services are supporting infrastructure.

**Recovery wave**:
The set of loop replacements caused by one observed failure of a shared
dependency. Replacing five loops after one gateway failure is one recovery
wave and five loop starts.

**Fleet safety hold**:
A persistent withdrawal of permission for the loop fleet to run, pending
explicit operator rearm. An unavailable service becoming healthy does not
end a safety hold.
