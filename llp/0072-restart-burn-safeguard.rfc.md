# LLP 0072: Bound restart-driven token burn with a persistent fleet safety hold

**Type:** RFC
**Status:** Accepted
**Systems:** Engine
**Author:** Codex
**Date:** 2026-09-07
**Extended-by:** LLP 0076 (PID 1 packaging and orphan reaping)
**Related:** 0001, 0002, 0010, 0013, 0015, 0034, 0039, 0057

## Recommendation

Extended-by: LLP 0077 (owned waiting and protected tmux supervision).

Put a deterministic circuit breaker ahead of every automatic loop start and
replacement. Permit one recovery in a rolling hour; the second failure
places the entire loop fleet on a persistent safety hold **before another
Claude is launched**. Also bound slower churn and total starts. Stop the
container on a trip so detached workers cannot keep consuming tokens. On
subsequent container starts, a protected boot gate permits diagnostics only
until an operator explicitly rearms the fleet.

Accepted for implementation following operator approval. The thresholds below
are protective defaults, not measurements of acceptable spend. Source changes
and tests do not establish deployment on the running fleet.

@ref LLP 0001 [constrained-by] — deterministic control over observed events
@ref LLP 0002 [constrained-by] — process exits and launch admissions are controller observations, not agents reporting success
@ref LLP 0010 [extends] — container loop replacement gains a safety admission gate
@ref LLP 0013 [extends] — context recycle remains subject to a start ceiling
@ref LLP 0034#mutual-coverage [extends] — automatic healing is subordinate to the fleet safety hold
@ref LLP 0039#mutual-coverage [extends] — mayor replacement uses the same gate
@ref LLP 0057#notify-direct [extends] — reuse deterministic notification for a safety hold

## Evidence and scope

The September 8 handoff reports 87 HypAware daemon restarts during about
33 hours of successful model usage, with 439 recorded sessions and roughly
13.8 million output tokens. These figures establish churn alongside large
usage; they do not establish the fraction wasted, dollar cost, or subscription
accounting. The daemon's historical termination cause is unconfirmed.

The repository corroborates the recovery mechanism:

- `docker/entrypoint.sh` polls every 30 seconds. When `hyp-daemon` disappears,
  it restarts the daemon, waits for an attached HTTP port, and replaces every
  live registered loop. Watchdog and mayor belong to that same registry.
- Separate supervisor branches restart a dead watchdog and mayor. The
  watchdog skill can create repo and mayor sessions directly; all three
  loop roles can recycle themselves with `tmux respawn-pane`.
- Boot currently launches loops even if gateway readiness times out.
- The outage sentinel detects missing usage, not excessive successful usage.
  Successful expensive work between crashes can keep its silence alarm quiet.
- `Dockerfile` runs everything as `neutral`, and that user owns the shipped
  checkout. A writable marker plus instructions to respect it would not
  establish an operator-only reset boundary.

Incident source: the supplied
`neutral-token-burn-safeguard-handoff-3ixjxtsa.md`; the originating workstation's
`/tmp/neutral-loop-supervisor.log` is its referenced raw evidence. This design
does not re-query or re-verify the live deployment.

The guarantee is bounded automatic recovery and context replacement in this
container deployment. A continuously running session can still spend heavily
without restarting. An exact token or monetary ceiling requires separate
request-path enforcement, including in-flight request reservations and
provider-specific accounting. HypAware availability and delayed usage queries
are unsuitable prerequisites for this crash safeguard. Memory diagnosis,
review deduplication, and workstation `neutral start` behavior are separate work.

<a id="budget"></a>
## Events and proposed limits

Use two overlapping rolling windows, evaluated inclusively at their lower
boundary. Apply all limits across supervisor and container incarnations.
Successful model output, gateway recovery, deployment, or time spent stopped
does not clear a hold.

| Observed event | Accounting | Proposed stop condition |
|---|---|---|
| Unexpected HypAware exit, unexpected registered loop exit, or watchdog replacement of a wedged loop | One recovery event; coalesce consequences of the same gateway failure into one wave | Second event within 60 minutes, or sixth within 24 hours |
| Every admitted start of a particular loop, including initial boot, recovery, operator restart, and context recycle | One start reservation for that stable loop identity | Deny its fifth start within 60 minutes, or its 25th within 24 hours |
| Gateway fails to become ready during boot or an allowed recovery | Failed recovery attempt | Hold after the 120-second readiness deadline; never launch against an unready gateway |
| Unclean controller/container termination | Record once at next boot, deduplicated by prior incarnation; admission may have been interrupted | Immediate hold; operator rearm required |
| Invalid/missing safety state, failed durable write, lost controller ownership, or ambiguous clock continuity | Admission cannot be proven | Refuse starts and remain held |

A dead daemon observed on successive polls is one failure, not a new failure
on every poll. A new daemon process that exits is a new event even if it
never became ready. The controller records which loop kills it initiated as
part of a wave; those exits must not multiply that wave's recovery count.
Independent deaths still count separately. Record events at observation,
before deciding whether to recover; failed launch reservations are never
refunded automatically.

Loop identity is deployment plus configured repository identity, or the
watchdog/mayor role, not a PID, container ID, or editable tmux display name.
Changing a model, credential, image, or session name does not mint a budget.
Registry changes require operator configuration and preserve existing history.

Context recycling keeps its existing idle/context preconditions and consumes
the all-start ceiling. The controller's own accepted replacement operation
can mark the old process exit expected; a caller's `reason=recycle` string
cannot exempt a spontaneous exit or a start. An operator can explicitly
prepare a controlled stop/deployment, bound to the current incarnation and
a short-lived, single-use operation ID. It exempts only the matching planned
termination from failure accounting; new starts still count. No automatic
path, including an updater, receives an unlimited planned-restart exemption.

### Why stop on the second failure?

One automatic recovery accommodates an isolated transient. A second failure
inside an hour means that recovery has not produced sustained stability, or
that the fleet is suffering multiple independent failures. It is sufficient
reason to stop unattended spending and ask for intervention; it need not prove
a particular crash cause or that every token since recovery was wasted.

For this deployment's five registered loops, allowing two full gateway
recoveries permits up to ten fresh loop starts before the next failure stops
the fleet. Allowing one permits up to five. These are starts, not token-cost
estimates: work and context sizes vary, and either wave can dispatch workers.
Waiting for a third failure buys another attempt at availability at the cost
of another full context rebuild. There is no evidence here that this extra
attempt is worth its exposure. The incident's 87 restarts over roughly 33
hours establish a serious incident, not a normal failure-rate baseline from
which to calibrate either threshold statistically.

The recommendation therefore favors protecting the account: **recover once;
if failure recurs within 60 minutes, hold before a second recovery**. It uses
a rolling window, so failures across a clock-hour boundary still count.
Healthy work between failures does not forgive the earlier failure. Two
unrelated loop failures also trip the shared fleet budget; that conservative
availability trade-off is explicit. Controlled operator stops and legitimate
context recycling retain their separate accounting above.

The temporary guard's three-per-hour threshold was provisional, not an
architectural requirement; this request specifies a stricter durable default
without changing that automation. The daily recovery limit catches, for
example, one failure every two hours. Six per day remains a separate,
provisional allowance, not a measured safe token budget.
The all-start ceilings catch a broken recycle loop even if it labels every
replacement intentional. They may stop legitimate high-frequency recycling;
that is a deliberate conservative default to tune with observed start rates.

<a id="controller"></a>
## One admission owner, independent of Claude and HypAware

Introduce a small deterministic controller as the container's root PID 1.
It owns the safety state and registered launch operations; every model process
continues to run as the unprivileged `neutral` user. It needs no model calls,
HypAware query cache, Slack availability, or Docker socket. Its policy is a
pure function of observed events, reservations, effective time, and limits;
filesystem, process, tmux, and notification adapters stay outside that core.

Route boot, gateway recovery, watchdog repair, watchdog/mayor death recovery,
and each role's context recycle through this controller. In container mode,
`neutral start` must also route through it or refuse to start an unmanaged loop.
The mayor command export names the guarded launcher, preserving its single
source of truth. Watchdog judgment about nudging versus replacing is retained;
permission to execute the replacement belongs to the controller. Repeated
nudges and ordinary model turns are not token-metered by this proposal.

Clients request operations on registered loop identities, never arbitrary
root shell commands. The controller serializes admission, durably reserves
the full set of starts for a wave, and then executes it as `neutral`. If any
member would exceed a ceiling, hold the fleet before killing/relaunching its
members. A retry with the same operation ID returns the original result and
cannot launch twice. A crash after reservation consumes that reservation;
ambiguous operations are not replayed into fresh launches at boot.

Preserve one orchestrator per repo: replacements retain tmux's in-place
replacement where applicable, and a new-session path independently verifies
that the predecessor is absent. Do not release admission to an asynchronous
client that might execute it after a hold. The controller performs the actual
launch in the same serialized lifecycle as admission and trip handling.

Make the controller, its dependencies, safety policy, and boot gate root-owned
and non-writable by agents, including their parent directories. Agents may
request start/replace/status, but cannot rearm, initialize state, alter policy,
or authorize a planned operator stop. Do not add sudo access or mount the
Docker socket. This prevents routine autonomous healing from clearing a hold;
it is not a sandbox against an agent deliberately issuing arbitrary model
requests while the fleet is admitted.

<a id="persistence"></a>
## Durable evidence and deliberate rearm

Use a dedicated named volume, `neutral-safety`, mounted at
`/var/lib/neutral-safety`, with a root-owned directory. A separate volume makes
its lifecycle explicit and avoids coupling the stop decision to HypAware's
data layout or to agent-writable repo directories. Deployment must retain it
alongside `neutral-work` and `neutral-hyp`, including container replacement.

An operator initializes a new deployment once. A missing volume or missing
initialized state never means a fresh automatic allowance. The controller
takes an exclusive OS lock on this volume for its lifetime; a second container
cannot run the same fleet. Protect the history, policy version, initialization
identity, and hold together; replacing an image must not overwrite them.

Persist controller-observed events, launch reservations, incarnation start/end
records, and operator commands in a bounded journal with an atomic checkpoint.
Sync journal/checkpoint changes and their directory before launching anything.
An observed termination can have an unknown cause; it must not be invented as
OOM or a specific signal. An unfinished incarnation at boot is observed
unclean termination, except for a matching authorized stop record. An unclean
controller termination holds immediately: it may have died while trying to
persist a stop decision. This is deliberately stricter than a child-daemon
failure and covers a failed hold write that left no durable new record. A corrupted
or incomplete journal fails closed instead of silently resetting counters.
Safe compaction retains everything needed for both windows and the current
hold, plus a bounded archive for incident review.

Use monotonic time within a host boot and persist its boot identity alongside
UTC timestamps. Docker recreation on the same boot must not reset elapsed
time. On a host reboot or clock anomaly where window expiration cannot be
established safely, retain counts conservatively; do not age them out using
an untrusted forward clock jump. The operator can explicitly rearm after
review. This trades unattended availability for a dependable budget.

The journal is operational evidence written by an independent controller and
the hold is an authorization decision. Neither asserts that agent work is
done. Git/coverage and current process liveness remain independently observed,
consistent with LLP 0002.

Proposed operator interface, **not currently implemented**:

```text
neutral safety status --json
neutral safety rearm --incident <id> --reason <text>
```

Status is readable without credentials and shows reason, window counts,
incident ID, process observations, and policy version. Rearm runs through the
root operator path in a diagnostics-only container (for example an explicit
root `docker exec`), checks the exact current incident, preserves the old
history, and records a new allowance epoch. Merely deleting a latch is invalid
state, not rearm. Neither an environment flag nor Slack prose clears a hold.

Rearm requires no surviving model processes and the bounded gateway health
check when capture is enabled. The controller then reserves and launches one
new fleet boot. Further failure starts consuming the new allowance immediately.
A healthy gateway alone never rearms, and repeated operator rearm is visible
in history rather than hidden as automatic recovery.

<a id="recovery"></a>
## Allowed recovery and protective shutdown

On an isolated failure below both recovery limits, admit at most one recovery
operation. A second failure within 60 minutes is held without another retry.
For a gateway failure, restore the daemon and verify that its current process
and attachment agree with the actual listening endpoint. Require 60 seconds
of stable, non-model readiness within the overall 120-second deadline before
replacing the fleet. An arbitrary HTTP response alone proves reachability,
not that the response came from the current attached daemon. Every probe has
a deadline; it cannot block failure observation. Do not route around capture
to a direct provider URL when the gateway is down.

Once a threshold is reached:

1. Serialize and persist the hold before any new launch. Cancel pending
   operations. If persistence fails, immediately prohibit launches and exit;
   the unclean incarnation/invalid state forces a hold at boot.
2. Retain a small evidence snapshot and try the deterministic alert, with a
   combined maximum delay of five seconds. Reporting cannot postpone shutdown
   indefinitely or veto it.
3. Exit PID 1, causing termination of the container's PID namespace. Killing
   tmux panes alone is insufficient: detached Claude/Codex review workers may
   survive their originating pane. In-flight provider work may incur usage
   after local termination; this design cannot revoke accepted remote requests.
4. If Docker restarts the container, the boot gate reads the hold before
   repository setup or any model launch. It remains alive in diagnostics-only
   mode, rather than exiting repeatedly under `restart=always`. No repo loop,
   watchdog, mayor, or inbound model-turn injection is started.

The v1 trade-off is a brief loss of capture and bridge availability during
whole-container termination. On a subsequent held boot, the sentinel and
read-only diagnostic services can run. HypAware may be started once for
capture/query access; if it exits, leave it down pending operator action.
There is no need to restart expensive agents to diagnose a held fleet. Keeping
capture continuously alive while killing every model descendant would require
a verified process-isolation boundary and is deferred.

The root controller remains able to exit even if the legacy shell supervisor
is wedged. Its own death ends the container because it is PID 1. Startup must
check the gate before running the existing entrypoint; otherwise its initial
launch section would bypass the protection. This design does not cover an
unresponsive host/kernel; the existing external dead-man's switch retains
that notification role.

<a id="evidence-alerts"></a>
## Evidence and notification

Capture each daemon and registered loop launch/exit from its first start using
a controller-owned wrapper that retains bounded stdout/stderr across tmux
replacement. Record UTC/monotonic time, deployment and incarnation IDs, role,
PID plus process start identity, operation/wave ID, observed exit status or
signal when available, and whether termination was controller-initiated.
Polling a missing pane supplies an unknown exit reason, not a guessed one.
Reserve disk space for safety state; evidence rotation or unavailable capture
must not prevent the hold. Keep raw tails private with bounded retention and
redact credentials before including excerpts in a human-facing report.

Extend the existing sentinel's fixed-template/direct-Slack notification path
with `[neutral fleet safety-hold@<incident-id>]`. Include the triggering facts,
which limit was hit, that all model processes are being stopped, and the
operator recovery command. A held boot reconciles a missing alert against
Slack history using the same incident key. Slack dedupe is best effort under
an ambiguous send response; a duplicate alert is preferable to resumed spend.
No secrets, complete environments, or raw prompts belong in the alert.

The sentinel still only reports; the controller enforces the hold. A safety
hold alert is immediate and independent of the one-hour silence threshold.
During a hold, suppress redundant fleet-silence roots. A reachable daemon or
an old usage timestamp does not count as recovery: report rearm separately,
then observed new model usage after rearm. Continue the external heartbeat as
sentinel liveness; it must not be described as proof that the fleet is running.
Without Slack, local status and retained logs still work and enforcement is
unchanged. If no automatic held reboot occurs, delivery retry waits for an
operator to start diagnostics; the external heartbeat covers the stopped state.

<a id="validation"></a>
## Acceptance tests and implementation boundary

Use synthetic clocks and events for a dependency-free policy suite. Use fake
model executables and a local fake gateway for controller/container tests;
verification must consume no model tokens.

| Scenario | Required observation |
|---|---|
| One gateway exit followed by stable recovery | One event, one wave, at most one successor per registered loop |
| Two exits inside 60 minutes, with successful work between them | First may recover; second is held before another daemon-recovery/loop-start operation |
| Failures at 10:55 and 11:05; failures exactly 60 minutes apart | Both pairs trip the rolling, inclusive hourly threshold |
| Second failure more than 60 minutes after the first | Hourly threshold alone permits recovery; daily and start ceilings still apply |
| Six failures two hours apart | Daily threshold trips despite no hourly storm |
| Five loops replaced for one daemon failure | One failure event and five start reservations, not five independent failures |
| Missing pane repeatedly polled; replacement daemon dies before readiness | Old exit counted once; new process death counted separately |
| Fifth start in an hour labeled recycle; operator deployment | Recycle ceiling still holds; deployment cannot clear history |
| Boot/recovery readiness timeout or wrong attached process/port | No model launches; hold within deadline |
| Concurrent watchdog, supervisor, and self-recycle requests | Serialized reservations, no overlap, no launch after hold |
| Crash before/after reservation, before/after spawn, or during hold write | Conservative restart; no refunded or duplicated launch |
| Container recreation with same volume; missing/corrupt volume; two containers | Hold persists; absent evidence refuses starts; only one owner |
| Host reboot or forward/backward wall-clock change | No premature allowance replenishment |
| Agent attempts rearm, policy edit, or planned-stop exemption | Permission denied; plain reason labels grant no exemption |
| Detached fake model worker and all tmux sessions survive parent-pane death | Container trip kills every local model process; held reboot starts none |
| Slack unavailable, sentinel dead, evidence disk full, or quota exhausted | Enforcement still stops dispatch; status reports missing evidence honestly |
| Exact operator rearm versus stale ID, healthy gateway, ordinary restart | Only exact authorized rearm creates an allowance epoch |

Implementation touches the pure policy/types/tests, root controller and boot
packaging, all container launch/recycle callers, the sentinel notification
adapter, and the documented deployment volume/operator commands. Preserve
model pinning and headless prompts. Updating guidance alone is insufficient.

Before deployment, pass `npm test`, `npm run typecheck`, and the no-token
container scenarios above, particularly orphan termination and held reboot
under the actual Docker restart policy. Implementation is referenced directly from the policy, controller, and tests.
Operational commands and packaging constraints live in `docker/SAFETY.md`.

The temporary hourly guard described in the handoff remains separate. Local
implementation does not edit it, stop/start the live fleet, or establish that
it is still active. Its replacement requires verifying the deployed breaker
and retaining the existing protection until that verification is complete.
