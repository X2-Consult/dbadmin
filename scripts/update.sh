#!/usr/bin/env bash
set -euo pipefail

# ─── Colours ────────────────────────────────────────────────────────────────
G='\033[0;32m'; B='\033[0;34m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
ok()   { echo -e "${G}✓ $*${N}"; }
info() { echo -e "${B}  $*${N}"; }
warn() { echo -e "${Y}⚠ $*${N}"; }
fail() { echo -e "${R}✗ $*${N}"; exit 1; }

echo -e "${B}DB Admin — Update${N}"
echo "════════════════════════"
echo ""

# ─── Sanity check ───────────────────────────────────────────────────────────
[ -f "package.json" ] && [ -f "server.mjs" ] || \
  fail "Run this script from the DB Admin project root directory"

# ─── Check for updates ──────────────────────────────────────────────────────
echo -e "${B}Checking for updates…${N}"
git fetch origin

BRANCH=$(git rev-parse --abbrev-ref HEAD)
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/${BRANCH}" 2>/dev/null) || fail "Cannot reach origin/${BRANCH}"

if [ "$LOCAL" = "$REMOTE" ]; then
  ok "Already up to date ($(git rev-parse --short HEAD))"
  exit 0
fi

# Show what's changing
echo ""
info "Changes since $(git rev-parse --short HEAD):"
git log --oneline "${LOCAL}..${REMOTE}" | sed 's/^/    /'
echo ""

read -rp "  Apply these updates? (Y/n): " CONFIRM
[[ "$CONFIRM" =~ ^[Nn]$ ]] && { info "Update cancelled"; exit 0; }

git pull origin "$BRANCH"
ok "Updated to $(git rev-parse --short HEAD)"

# ─── Dependencies ───────────────────────────────────────────────────────────
# Only run npm ci if package-lock.json changed in this pull
if git diff HEAD@{1} --name-only 2>/dev/null | grep -q "package-lock.json"; then
  echo ""
  echo -e "${B}Updating dependencies…${N}"
  npm ci --silent
  ok "Dependencies updated"
fi

# ─── Build ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${B}Building…${N}"
if ! npm run build; then
  echo ""
  fail "Build failed — the old version is still running. Fix the error and try again."
fi
ok "Build complete"

# ─── Restart ────────────────────────────────────────────────────────────────
echo ""
echo -e "${B}Restarting server…${N}"

if systemctl is-active --quiet dbadmin 2>/dev/null; then
  sudo systemctl restart dbadmin
  ok "Restarted systemd service (dbadmin)"
  info "Status: sudo systemctl status dbadmin"

elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q dbadmin; then
  pm2 restart dbadmin
  ok "Restarted pm2 process (dbadmin)"

else
  warn "No managed service found — restart the server manually"
  info "Kill the old process, then run: node server.mjs"
fi

# ─── Done ───────────────────────────────────────────────────────────────────
echo ""
ok "Update complete!"
