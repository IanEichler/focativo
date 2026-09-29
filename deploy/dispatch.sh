#!/usr/bin/env bash
# Installed root-owned at /usr/local/bin/focativo-deploy-dispatch.
# The dedicated GitHub SSH key may only invoke this command, without forwarding/PTY.
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin
export HOME=/opt/estoque-ia
repo="$HOME/app"
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
  echo 'Only deploy <commit SHA> is allowed.' >&2
  exit 64
fi
sha=${BASH_REMATCH[1]}
exec 9>"$HOME/deploy.lock"
flock -w 1800 9
git -C "$repo" fetch --no-tags origin main
if [[ $sha != $(git -C "$repo" rev-parse origin/main) ]]; then
  echo 'Skipped: a newer commit is already on main.'
  exit 0
fi
script=$(mktemp "$HOME/.deploy-script.XXXXXX")
trap 'rm -f -- "$script"' EXIT
git -C "$repo" show "$sha:deploy/release.sh" > "$script"
bash "$script" "$sha"
