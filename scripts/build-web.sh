#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM="$ROOT/.upstream-src"
REF="5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c"
if [ ! -d "$UPSTREAM/.git" ]; then
  git clone --no-checkout https://github.com/deepseek-ai/chat-demo.git "$UPSTREAM"
fi
git -C "$UPSTREAM" fetch --depth 1 origin "$REF"
git -C "$UPSTREAM" checkout --force --detach "$REF"
cp "$ROOT/patches/nativeExport.ts" "$UPSTREAM/src/services/chat/nativeExport.ts"
mkdir -p "$UPSTREAM/src/services/billing" "$UPSTREAM/src/components/billing"
cp "$ROOT/patches/billing/pricing.ts" "$ROOT/patches/billing/balance.ts" "$ROOT/patches/billing/meter.ts" "$UPSTREAM/src/services/billing/"
cp "$ROOT/patches/billing/BillingBar.tsx" "$ROOT/patches/billing/BillingBar.module.css" "$UPSTREAM/src/components/billing/"
python3 "$ROOT/scripts/patch-upstream.py" "$UPSTREAM"
(
  cd "$UPSTREAM"
  corepack pnpm install --frozen-lockfile
  corepack pnpm type
  corepack pnpm build
)
DEST="$ROOT/app/src/main/assets/www"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$UPSTREAM/dist/." "$DEST/"
test -s "$DEST/index.html"
test -d "$DEST/static/js"
echo "Bundled DeepSeek web UI: $DEST"
