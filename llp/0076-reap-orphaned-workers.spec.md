# LLP 0076: Reap orphaned workers without weakening the fleet safety hold

**Type:** Spec
**Status:** Accepted
**Systems:** Engine
**Author:** Codex
**Date:** 2026-09-11
**Related:** 0072

@ref LLP 0072#controller [extends] - change PID 1 packaging while preserving one root admission owner
@ref LLP 0072#recovery [constrained-by] - controller death still terminates the entire PID namespace

## Evidence

The September 10 deployment put Node directly at PID 1. The next day the
container had 3,057 zombies, all adopted by that PID. Node collects children
it spawned through its own handles, but does not reap arbitrary orphaned
worker descendants. An isolated shell-grandchild reproduction leaves a
zombie under Node PID 1 and none under tini.

<a id="init"></a>
## Required process boundary

Package tini as PID 1, with the root Node safety controller as its direct
child. The entrypoint must reject an external init or shared PID namespace.
The exclusive flock must exec the controller without another parent process.
The controller must reject startup without the bundled tini as its PID 1
parent. Tini forwards termination signals, reaps adopted children, and exits
when its direct child exits. Its exit ends the namespace, killing detached
workers even after a controller crash or failed hold write.

This supersedes only the requirement that Node itself be PID 1. Admission,
operator permissions, persistence, restart limits, and held-boot behavior
remain as specified in LLP 0072. Installing the fix does not authorize rearming
or restarting a fleet an operator stopped.

<a id="validation"></a>
## Verification

The fake-service Docker smoke must observe that exited orphaned grandchildren
disappear from /proc while the controller stays alive. It must also verify
controller death kills detached workers and reboots held, and retain the
existing recovery, durable hold, and unauthorized-operation checks. A direct
unmanaged controller and an externally supplied --init must fail closed.
