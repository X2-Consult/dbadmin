#!/usr/bin/env bash
set -euo pipefail

# ─── Colours ────────────────────────────────────────────────────────────────
G='\033[0;32m'; B='\033[0;34m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
ok()   { echo -e "${G}✓ $*${N}"; }
info() { echo -e "${B}  $*${N}"; }
warn() { echo -e "${Y}⚠ $*${N}"; }
fail() { echo -e "${R}✗ $*${N}"; exit 1; }

echo -e "${B}"
echo "  ██████╗ ██████╗      █████╗ ██████╗ ███╗   ███╗██╗███╗   ██╗"
echo "  ██╔══██╗██╔══██╗    ██╔══██╗██╔══██╗████╗ ████║██║████╗  ██║"
echo "  ██║  ██║██████╔╝    ███████║██║  ██║██╔████╔██║██║██╔██╗ ██║"
echo "  ██║  ██║██╔══██╗    ██╔══██║██║  ██║██║╚██╔╝██║██║██║╚██╗██║"
echo "  ██████╔╝██████╔╝    ██║  ██║██████╔╝██║ ╚═╝ ██║██║██║ ╚████║"
echo "  ╚═════╝ ╚═════╝     ╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝"
echo -e "${N}"
echo "  Installer — sets up DB Admin for local or server use"
echo ""

# ─── Prerequisite checks ────────────────────────────────────────────────────
echo -e "${B}Checking prerequisites…${N}"

command -v node &>/dev/null || fail "Node.js not found. Install Node.js 18+ from https://nodejs.org"
NODE_MAJOR=$(node -e "console.log(parseInt(process.versions.node))")
(( NODE_MAJOR >= 18 )) || fail "Node.js 18+ required. Found: $(node --version)"
ok "Node.js $(node --version)"

command -v npm &>/dev/null || fail "npm not found"
ok "npm $(npm --version)"

command -v git &>/dev/null || fail "git not found"
ok "git $(git --version | awk '{print $3}')"

# ─── Dependencies ───────────────────────────────────────────────────────────
echo ""
echo -e "${B}Installing dependencies…${N}"
npm ci --silent
ok "Dependencies installed"

# ─── Environment setup ──────────────────────────────────────────────────────
echo ""
if [ -f .env.local ]; then
  ok ".env.local already exists — skipping (delete it to reconfigure)"
else
  echo -e "${B}Configuring environment…${N}"

  while true; do
    read -rsp "  UI login password: " UI_PASS; echo
    read -rsp "  Confirm password:  " UI_PASS2; echo
    [ "$UI_PASS" = "$UI_PASS2" ] && break
    warn "Passwords do not match, try again"
  done

  SESSION_SECRET=$(node -e "const{randomBytes}=require('crypto');process.stdout.write(randomBytes(32).toString('hex'))")

  cat > .env.local <<EOF
# UI login password — used to sign in to the web interface
UI_PASSWORD=${UI_PASS}

# Secret for signing session tokens — change this and keep it private
SESSION_SECRET=${SESSION_SECRET}
EOF
  ok ".env.local created"
fi

# ─── Port ───────────────────────────────────────────────────────────────────
echo ""
read -rp "  Port to listen on [3333]: " PORT
PORT=${PORT:-3333}

# Append PORT to .env.local only if not already set
grep -q "^PORT=" .env.local 2>/dev/null || echo "PORT=${PORT}" >> .env.local
ok "Port: ${PORT}"

# ─── SSL cert ───────────────────────────────────────────────────────────────
echo ""
if [ -f certs/cert.pem ] && [ -f certs/key.pem ]; then
  ok "SSL certificate already exists"
else
  read -rp "  Generate a self-signed SSL certificate for HTTPS? (y/N): " WANT_CERT
  if [[ "$WANT_CERT" =~ ^[Yy]$ ]]; then
    npm run generate-cert
  else
    warn "Skipping SSL — server will run over HTTP"
  fi
fi

# ─── Build ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${B}Building application…${N}"
npm run build
ok "Build complete"

# ─── Service setup (optional) ───────────────────────────────────────────────
echo ""
MANAGED=false

# Try pm2 first (cross-platform, no sudo needed)
if command -v pm2 &>/dev/null; then
  read -rp "  Register as a pm2 process? (Y/n): " WANT_PM2
  if [[ ! "$WANT_PM2" =~ ^[Nn]$ ]]; then
    pm2 start server.mjs --name dbadmin -- 2>/dev/null || true
    pm2 save
    ok "Registered with pm2 (name: dbadmin)"
    info "pm2 startup  →  follow pm2's instructions to survive reboots"
    MANAGED=true
  fi
fi

# systemd fallback (Linux only, needs sudo)
if ! $MANAGED && [ "$(uname -s)" = "Linux" ] && command -v systemctl &>/dev/null; then
  read -rp "  Set up as a systemd service? (y/N): " WANT_SVC
  if [[ "$WANT_SVC" =~ ^[Yy]$ ]]; then
    INSTALL_DIR="$(pwd)"
    CURRENT_USER="$(whoami)"
    NODE_BIN="$(command -v node)"
    SVC_FILE="/etc/systemd/system/dbadmin.service"

    sudo tee "$SVC_FILE" > /dev/null <<EOF
[Unit]
Description=DB Admin web interface
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env.local
ExecStart=${NODE_BIN} ${INSTALL_DIR}/server.mjs
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/dbadmin.log
StandardError=append:/var/log/dbadmin.log

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable dbadmin
    sudo systemctl start dbadmin
    ok "systemd service installed and started (dbadmin.service)"
    info "Logs: sudo journalctl -u dbadmin -f"
    MANAGED=true
  fi
fi

if ! $MANAGED; then
  info "To start the server manually: node server.mjs"
  info "To run in the background:     nohup node server.mjs >> /var/log/dbadmin.log 2>&1 &"
fi

# ─── Done ───────────────────────────────────────────────────────────────────
PROTO="http"
[ -f certs/cert.pem ] && PROTO="https"

echo ""
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
ok "DB Admin is ready!"
echo -e "  Open: ${B}${PROTO}://localhost:${PORT}${N}"
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo ""
