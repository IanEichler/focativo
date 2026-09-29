#!/usr/bin/env bash
set -euo pipefail
sha=${1:?Commit SHA is required}
[[ $sha =~ ^[a-f0-9]{40}$ ]] || exit 64
base=/opt/estoque-ia
repo="$base/app"
export APP_RELEASE_SHA="$sha"
export CI=true
mkdir -p "$base/releases"
previous=$repo
if [[ -L "$base/current" && -d "$base/current" ]]; then
  previous=$(readlink -f "$base/current")
fi
if [[ -f "$previous/.release-sha" ]] && [[ $(cat "$previous/.release-sha") == "$sha" ]]; then
  echo "Already deployed: $sha"
  exit 0
fi
release=$(mktemp -d "$base/releases/$sha.XXXXXX")
git -C "$repo" archive "$sha" | tar -x -C "$release"
printf '%s\n' "$sha" > "$release/.release-sha"
cd "$release"
echo "Preparing release $sha"
pnpm install --frozen-lockfile
node --env-file=/etc/estoque-ia/web.env deploy/run-command.mjs pnpm build
pnpm --filter @estoque-ia/whatsapp-service --fail-if-no-match typecheck
pnpm --filter @estoque-ia/jobs-service --fail-if-no-match typecheck
node --env-file=/etc/estoque-ia/deploy.env packages/database/scripts/deploy-migrations.mjs

activated=false
start_release() {
  # PM2 reload retains an existing process's cwd/script. Recreate definitions
  # so all three processes actually use this release's absolute paths.
  pm2 delete estoque-ia-web estoque-ia-whatsapp estoque-ia-jobs >/dev/null 2>&1 || true
  pm2 start "$1/deploy/ecosystem.config.cjs" --env production --update-env
}
rollback() {
  code=$?
  trap - EXIT
  if [[ $code != 0 && $activated == true ]]; then
    echo "Release failed health checks; restoring $previous" >&2
    export APP_RELEASE_SHA
    APP_RELEASE_SHA=$(cat "$previous/.release-sha" 2>/dev/null || git -C "$previous" rev-parse HEAD)
    start_release "$previous" || true
    ln -sfn "$previous" "$base/current"
    pm2 save || true
  fi
  exit "$code"
}
trap rollback EXIT
activated=true
start_release "$release"
healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3000/api/health |
    node -e 'let text="";process.stdin.on("data",c=>text+=c);process.stdin.on("end",()=>{try{const r=JSON.parse(text);process.exit(r.ok&&r.commit===process.argv[1]?0:1)}catch{process.exit(1)}})' "$sha" &&
    curl --fail --silent --max-time 5 http://127.0.0.1:4001/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done
[[ $healthy == true ]] || { echo 'Health check failed' >&2; exit 1; }
curl --fail --silent --max-time 15 https://focativo.com/api/health |
  node -e 'let text="";process.stdin.on("data",c=>text+=c);process.stdin.on("end",()=>{try{const r=JSON.parse(text);process.exit(r.ok&&r.commit===process.argv[1]?0:1)}catch{process.exit(1)}})' "$sha"
pm2 jlist | node -e 'let text="";process.stdin.on("data",c=>text+=c);process.stdin.on("end",()=>{const apps=JSON.parse(text);process.exit(["estoque-ia-web","estoque-ia-whatsapp","estoque-ia-jobs"].every(name=>apps.some(p=>p.name===name&&p.pm2_env.status==="online"&&p.pm2_env.pm_cwd.startsWith(process.argv[1]+"/")))?0:1)})' "$release"
ln -sfn "$release" "$base/current"
pm2 save
echo "Deployment verified: $sha"
# Retain the three newest releases and the previous active release for rollback.
count=0
while IFS= read -r candidate; do
  count=$((count + 1))
  [[ $count -le 3 || $candidate == "$release" || $candidate == "$previous" ]] && continue
  [[ $candidate =~ ^/opt/estoque-ia/releases/[a-f0-9]{40}\.[A-Za-z0-9]+$ ]] || continue
  [[ -d $candidate && ! -L $candidate ]] || continue
  rm -rf -- "$candidate" || echo "Could not clean old release: $candidate" >&2
done < <(find "$base/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
