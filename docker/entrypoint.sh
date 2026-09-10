#!/usr/bin/env bash
# @ref LLP 0072#controller [implements] — root PID 1, exclusive persistent ownership, no model launch before admission
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'neutral safety entrypoint requires root' >&2; exit 75; }
mkdir -p /var/lib/neutral-safety
chown root:root /var/lib/neutral-safety
chmod 700 /var/lib/neutral-safety
# --no-fork makes Node PID 1. Its exit kills the whole PID namespace, including
# detached model workers. Child launches close the inherited lock descriptor.
exec flock --nonblock --no-fork /var/lib/neutral-safety/owner.lock node /opt/neutral/docker/safety-controller.js
