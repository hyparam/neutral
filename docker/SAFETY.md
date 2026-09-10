# Restart safety guard

The container allows one automatic recovery, then holds the whole fleet on
its second failure within a rolling 60 minutes. Six failures within 24 hours
also hold it. Each loop may start at most four times per hour and 24 times per
day, including context recycling. These are restart limits, not token quotas.

The root PID 1 controller owns admission and durable state. Claude, HypAware,
the bridge, and sentinel run as `neutral`. A trip persists the hold and exits
PID 1, terminating detached workers with the container. Docker may restart the
container, but it then runs diagnostics only. The operator must explicitly
rearm it. See [LLP 0072](../llp/0072-restart-burn-safeguard.rfc.md).

## Deployment and first boot

Add the dedicated mount to the existing deployment, preserving its other
volumes and environment configuration:

```sh
-v neutral-safety:/var/lib/neutral-safety
```

For a code-only upgrade, pass the currently installed `CLAUDE_CODE_VERSION`
and `HYPAWARE_VERSION` build arguments and set `NEUTRAL_REVISION` to the shipped
commit. Preserve the running container's environment overrides, including
whether capture is enabled. A known exhausted model allowance is a reason to
leave the replacement held after initialization, not to rearm repeatedly.

Keep that volume for the lifetime of the fleet, including image upgrades,
container recreation, and moves to another host. The image now starts as root;
do not override its user, entrypoint, PID namespace, or enable Docker's `--init`
(the controller must be PID 1). An exclusive file lock prevents two containers
from running against the same safety volume. Agents receive no sudo access or
Docker socket. Do not run an older, unguarded rollback image against these
volumes and assume that it understands the hold.

First boot intentionally starts no model processes. Read status, then use the
returned hold ID in initialization. Commands below run from the Docker host;
replace `INCIDENT` with the current ID, not a literal placeholder:

```sh
docker exec neutral-loop neutral safety status --json
docker exec --user root neutral-loop neutral safety init \
  --incident INCIDENT --deployment hypebox-loops --reason 'Initialize restart safeguard'
docker exec neutral-loop neutral safety status --json
```

Initialization creates a new hold ID. Review the configuration and use that
ID to rearm:

```sh
docker exec --user root neutral-loop neutral safety rearm \
  --incident INCIDENT --reason 'Configuration checked; start fleet'
```

With HypAware enabled, rearm requires 60 seconds of stable gateway readiness
within a 120-second deadline. No billable probe is made. Readiness checks the
attached port, the owning process family, and HTTP reachability. Failure
retains the hold. Configure `NEUTRAL_HYPAWARE=0` only when deliberately running
without capture; the guard itself is mandatory either way.

## Repairs, stops, and holds

A watchdog or operator repairs a registered loop through the same gate:

```sh
docker exec --user neutral neutral-loop neutral safety replace --session neutral-hypaware
```

A running loop recycles with `neutral safety recycle`; its controller-injected
session/generation identifies the predecessor. A stale request cannot start a
second successor. Direct tmux create/respawn commands are not supported repair
paths in this container. `neutral start` refuses unmanaged container launches.
Nudges to an existing session remain the watchdog's judgment.

For a planned shutdown, first disable automatic Docker restart, then use the
operator stop. It immediately stops the fleet and records a clean termination;
a later start retains the previous window counts:

```sh
docker update --restart=no neutral-loop
docker exec --user root neutral-loop neutral safety stop --reason 'Planned deployment'
```

Restore the intended restart policy when starting the replacement. An ordinary
`docker stop`, a kill, or an unclean controller exit preserves or creates a
hold; it cannot silently reset allowances. This favors account protection over
unattended recovery from host/container failure.

After a trip, inspect the cause and fix it before rearming the exact current
incident. Rearm is the explicit grant of a fresh allowance; it archives the old
incident in the audit rather than hiding that it happened. A gateway becoming
healthy, a quota reset, or a restart does not grant permission to run.

## Evidence and diagnostics

`neutral safety status --json` reports the hold, current policy, counts, and
controller-known process identities. Those identities are observations at
launch; the controller checks liveness on every pass. A held boot can run the
sentinel and make one diagnostic HypAware start; a failed diagnostic daemon is
left down. The bridge and all model loops stay stopped.

The root-only safety volume contains `state.json` (checksummed atomic
checkpoint), `events.jsonl` and one rotated predecessor (2 MiB per file), and
the owner lock. The checkpoint retains both active counting windows. Events
include reservations, starts, exits, holds, and operator actions. Private pane
output is bounded to two 1 MiB files per session under
`/home/neutral/.local/state/neutral-capture`. These tails are in the container
layer; export them before deleting an incident container. They may contain
sensitive tool output, so do not paste them into alerts.

The existing sentinel sends fixed-template safety alerts without an LLM when
Slack outbound configuration is present. It retries held-boot delivery, checks
Slack history for the incident key, and suppresses redundant silence alerts
while held. Notification failure cannot permit another launch. The optional
external heartbeat reports sentinel liveness, not fleet admission.

Missing or corrupt state refuses starts. Initialization cannot overwrite an
existing checkpoint. If it is corrupt, an operator must preserve the checkpoint
and audit outside the live state filename, then explicitly initialize and
rearm using the new incident ID. This is a deliberate administrative reset;
never delete the safety volume as a recovery step.

## No-token verification

```sh
npm test
npm run typecheck
docker build -f docker/test-fixtures/safety/Dockerfile -t neutral-safety-test:local .
npm run smoke:safety
```

An existing local image containing Node 22, tmux, and util-linux can be used as
the test base with `--build-arg BASE_IMAGE=neutral-loop:latest`. The test image
replaces Claude and HypAware with local fake services and clears credentials.
The smoke creates and removes only its uniquely named test containers and test
volumes. It writes JSONL assertions, the controller audit, and container logs
to a printed temporary directory. No production deployment is touched.

The temporary external guard should remain until deployment passes these
checks with its real restart policy and mounted safety volume. Implementing
this code does not itself install the guard on the running fleet.
