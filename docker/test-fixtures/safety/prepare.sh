#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/.hyp" "$HOME/.claude" /work/a
printf '{}\n' > "$HOME/.hyp/hypaware-config.json"
