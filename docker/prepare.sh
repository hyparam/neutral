#!/usr/bin/env bash
# @ref LLP 0072#controller [implements] — unprivileged setup only; PID 1 owns every process launch
set -euo pipefail
log() { printf '[neutral-prepare] %s\n' "$*"; }
[ "$(id -u)" != 0 ] || { log 'setup must run as neutral'; exit 1; }
gh auth status >/dev/null 2>&1
[ -n "${NEUTRAL_REPOS:-}" ]
git config --global user.name "${GIT_AUTHOR_NAME:-neutral-loop}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-neutral-loop@localhost}"
gh auth setup-git

if [ "${NEUTRAL_HYPAWARE:-1}" = 1 ]; then
  if [ ! -f "$HOME/.hyp/hypaware-config.json" ]; then
    hyp init --yes --no-daemon
  fi
  if [ -n "${HYP_REMOTE_URL:-}" ] && [ -n "${HYP_REMOTE_TOKEN:-}" ]; then
    if [ -f "$HOME/.hyp/hypaware/config-control/state.json" ] || [ -f "$HOME/.hyp/hypaware/config-control/seed.json" ]; then
      log 'hypaware fleet enrollment already persisted'
    else
      token_file=$(mktemp)
      trap 'rm -f "$token_file"' EXIT
      chmod 600 "$token_file"
      printf '%s' "$HYP_REMOTE_TOKEN" > "$token_file"
      hyp join "$HYP_REMOTE_URL" --token-file "$token_file" --no-daemon
      rm -f "$token_file"
      trap - EXIT
    fi
  fi
fi

trust_dir() {
  local dir="$1"
  jq --arg dir "$dir" \
    '.projects[$dir] = ((.projects[$dir] // {}) + {hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true})' \
    "$HOME/.claude.json" > "$HOME/.claude.json.tmp"
  mv "$HOME/.claude.json.tmp" "$HOME/.claude.json"
  if [ "${NEUTRAL_HYPAWARE:-1}" = 1 ]; then
    hyp ignore --sync "$dir" >/dev/null || log "WARNING: could not classify $dir for sync"
  fi
}
for repo in $(printf '%s' "$NEUTRAL_REPOS" | tr ',' ' '); do
  dir="/work/$(basename "$repo")"
  if [ ! -d "$dir/.git" ]; then
    log "cloning $repo"
    gh repo clone "$repo" "$dir"
  fi
  trust_dir "$dir"
done
trust_dir /work
node /opt/neutral/docker/install-worker-hooks.js
