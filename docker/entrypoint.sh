#!/usr/bin/env bash
# @ref LLP 0076#init [implements] - tini reaps orphans and exits with the admission owner
set -euo pipefail
[ "$(id -u)" = 0 ] && [ "$$" = 1 ] || { echo 'neutral safety entrypoint requires root PID 1 (no external --init)' >&2; exit 75; }
mkdir -p /var/lib/neutral-safety
chown root:root /var/lib/neutral-safety
chmod 700 /var/lib/neutral-safety
# flock execs Node without forking: tini's direct child owns the lock. When
# that child exits, tini exits too, terminating every remaining descendant.
exec /usr/bin/tini -- flock --nonblock --no-fork /var/lib/neutral-safety/owner.lock node /opt/neutral/docker/safety-controller.js
