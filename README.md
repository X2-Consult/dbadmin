# DB Admin

A self-hosted web-based database administration tool for **MySQL**, **MariaDB**, and **PostgreSQL**. Built as a modern alternative to phpMyAdmin with a dark UI, multi-connection support, and a focus on security.

---

## Features

### Connections
- **Multi-connection** — manage multiple MySQL/MariaDB and PostgreSQL servers from one interface
- **SSH tunnels** — connect to databases behind a bastion host by configuring SSH Host/User/Key in the connection form; the tunnel is opened automatically
- **SSL modes** — disable, require (skip verify), or verify (full cert chain) per connection
- **Read-only mode** — blocks all INSERT, UPDATE, DELETE, DROP, and DDL at the application layer

### SQL editor
- **Multi-tab** — open multiple independent SQL editor tabs; each retains its own query and result set
- **Monaco editor** — full syntax highlighting and SQL autocomplete (tables + columns in scope)
- **Explain / Dry run** — preview the execution plan or wrap a query in a transaction that auto-rolls back
- **Format** — auto-formats SQL by uppercasing keywords and adding clause line breaks
- **Destructive guard** — DROP, TRUNCATE, DELETE, ALTER, and UPDATE require explicit confirmation
- **Result sorting** — click any column header to sort results ascending/descending
- **Result pagination** — results over 200 rows are paginated
- **Cell expand** — click any long cell to view the full value; JSON is auto-pretty-printed
- **Export CSV / JSON** — download the current result set in your chosen format
- **Bar chart** — toggle a chart view of query results with configurable X and Y axes
- **Save / History** — bookmark named queries and browse the full execution history

### Table browser
- **Paginated data view** — 50 rows per page with per-column text filters and column-header sorting
- **Inline editing** — insert, edit, and delete rows without leaving the browser
- **Bulk delete** — select multiple rows and delete them in one action
- **Export CSV / JSON / SQL** — export all table rows; SQL format produces INSERT INTO statements
- **Copy table** — duplicate a table's structure (and optionally its data) to a new name
- **Import CSV** — upload a CSV file to insert rows into any table

### Schema tools
- **Structure view** — column types, nullability, keys, indexes, and foreign key references
- **DDL editor** — view and modify CREATE TABLE statements directly
- **Alter column** — rename, retype, or change nullability/default of any column via a form
- **Index management** — add and drop indexes from the Structure view
- **Table creation wizard** — visual column builder with type dropdown and live SQL preview
- **Table maintenance** — OPTIMIZE, ANALYZE, REPAIR, and CHECK via the table actions menu
- **Views** — browse view data like a table; manage views (create, edit body, drop) from the db sidebar
- **Routines** — list, view body, create, and drop stored procedures and functions
- **Triggers** — list, view body, create, and drop triggers
- **Events** — list, view body, create, and drop scheduled events (MySQL/MariaDB)

### Analysis & diagnostics
- **ER diagram** — interactive force-directed relationship diagram; tables are nodes, FK constraints are edges; drag to reposition, zoom, pan, hover to highlight connections
- **Data search** — search a term across all text columns in every table in a database; results show matched column and value with a link to the table
- **Schema diff** — compare two databases (on any connection) and see tables/columns added, removed, or changed
- **Top queries** — slowest queries by average execution time from `performance_schema` (MySQL) or `pg_stat_statements` (PostgreSQL)
- **Process list** — active connections with kill button
- **Server variables** — full list of server configuration variables with search

### Operations
- **Backup & restore** — SQL dump download per database; upload and execute `.sql` restore files
- **Live stats** — real-time server metrics (connections, queries/sec, throughput)
- **User management** — list, create, and drop database users with privilege assignment
- **Create / drop databases** — with two-step confirmation and backup prompt on drop

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| SQL editor | [Monaco Editor](https://microsoft.github.io/monaco-editor/) (`@monaco-editor/react`) |
| MySQL/MariaDB driver | [mysql2](https://github.com/sidorares/node-mysql2) |
| PostgreSQL driver | [pg](https://node-postgres.com) |
| SSH tunnels | [ssh2](https://github.com/mscdex/ssh2) |
| Icons | [Lucide React](https://lucide.dev) |
| Auth | HMAC-SHA256 session tokens (Web Crypto API), `HttpOnly` + `SameSite=Strict` cookies |
| Crypto | AES-256-GCM for credential encryption at rest (Node.js `crypto`) |
| Server | Custom Node.js HTTP/HTTPS server (`server.mjs`) with auto TLS detection |
| Runtime | Node.js 18+ |

---

## Requirements

- Node.js 18 or later
- npm
- git
- A running MySQL/MariaDB or PostgreSQL instance

---

## Installation

Clone the repository and run the interactive installer:

```bash
git clone <repo-url> dbadmin
cd dbadmin
bash install.sh
```

The installer will:

1. Check Node.js 18+, npm, and git are available
2. Install dependencies (`npm ci`)
3. Prompt for a UI login password and generate a secure `SESSION_SECRET`
4. Ask for a port (default `3333`)
5. Optionally generate a self-signed SSL certificate
6. Build the application (`npm run build`)
7. Optionally register as a **pm2** process or **systemd** service

After installation, open the URL printed at the end and sign in with the password you set.

---

## Updating

To pull the latest changes and redeploy safely:

```bash
bash scripts/update.sh
```

The update script will:

1. Fetch and show you the incoming commits
2. Ask for confirmation before applying anything
3. Run `git pull`
4. Run `npm ci` only if `package-lock.json` changed
5. Run `npm run build` — **if the build fails, the old version keeps running and the script aborts**
6. Restart the server automatically (systemd or pm2), or prompt you to restart manually

---

## Configuration

All configuration is in `.env.local` in the project root. This file is created by the installer and never committed to git.

```env
# Password for the web UI login
UI_PASSWORD=your-password-here

# Secret used to sign session tokens — keep private, change to invalidate all sessions
SESSION_SECRET=<64-char hex string>

# Port to listen on (default 3333)
PORT=3333
```

Database connections are configured through the UI (the connection selector in the sidebar) and stored encrypted in `data/connections.json`.

---

## HTTPS / SSL setup

The server auto-detects TLS: if `certs/cert.pem` and `certs/key.pem` exist it starts HTTPS, otherwise HTTP.

### Option A — Self-signed certificate (local / private network)

Generate a 4096-bit RSA certificate with a Subject Alternative Name covering `localhost` and `127.0.0.1`:

```bash
npm run generate-cert
```

Then restart the server. The cert is valid for 10 years and stored in `certs/`. The script prints OS-specific instructions for trusting it in your browser.

> **Note:** Browsers will show a "not trusted" warning for self-signed certs until you explicitly trust them.
> - **macOS** — open `certs/cert.pem` in Keychain Access, find the certificate, double-click it, and set Trust to "Always Trust"
> - **Linux** — `sudo cp certs/cert.pem /usr/local/share/ca-certificates/dbadmin.crt && sudo update-ca-certificates`
> - **Windows** — double-click `certs/cert.pem`, choose "Install Certificate", place it in "Trusted Root Certification Authorities"

### Option B — Let's Encrypt (public domain)

Use [Certbot](https://certbot.eff.org) to issue a free trusted certificate for your domain:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d db.yourdomain.com
```

Certbot stores certs under `/etc/letsencrypt/live/`. Copy them into `certs/`:

```bash
mkdir -p certs
sudo cp /etc/letsencrypt/live/db.yourdomain.com/privkey.pem   certs/key.pem
sudo cp /etc/letsencrypt/live/db.yourdomain.com/fullchain.pem certs/cert.pem
sudo chown $USER:$USER certs/*.pem
```

Restart the server, then set up auto-renewal. Add a cron job (or systemd timer) to renew and copy the certs before they expire (Let's Encrypt certs last 90 days):

```bash
# crontab -e  — runs daily at 03:00
0 3 * * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/db.yourdomain.com/privkey.pem   /path/to/dbadmin/certs/key.pem && \
  cp /etc/letsencrypt/live/db.yourdomain.com/fullchain.pem /path/to/dbadmin/certs/cert.pem && \
  systemctl restart dbadmin
```

### Option C — Reverse proxy (nginx / Caddy)

If you already run nginx or Caddy, let the proxy terminate TLS and forward plain HTTP to DB Admin. This is the recommended approach for production.

**nginx:**
```nginx
server {
    listen 443 ssl;
    server_name db.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/db.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/db.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3333;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name db.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

**Caddy** (`Caddyfile`) — handles Let's Encrypt automatically, no manual cert steps needed:
```
db.yourdomain.com {
    reverse_proxy localhost:3333
}
```

---

## Docker

### Quick start

```bash
git clone <repo-url> dbadmin
cd dbadmin

# Generate a session secret, then create your .env file
echo "UI_PASSWORD=yourpassword" > .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env

docker compose up -d
```

Open `http://localhost:3333` and sign in with the password you set.

Connection data is persisted in a named Docker volume (`dbadmin-data`) so it survives container restarts and upgrades.

### HTTPS in Docker

Copy your certificate files into the `dbadmin-certs` volume, then restart:

```bash
docker cp certs/cert.pem $(docker compose ps -q dbadmin):/app/certs/cert.pem
docker cp certs/key.pem  $(docker compose ps -q dbadmin):/app/certs/key.pem
docker compose restart dbadmin
```

Or mount a host directory instead of the named volume by editing `docker-compose.yml`:

```yaml
volumes:
  - ./certs:/app/certs
```

### Custom port

Set `PORT` in your `.env` file:

```env
PORT=8080
```

### Updating

```bash
git pull
docker compose up -d --build
```

---

## Running as a service

### systemd (Linux)

The installer can create the service file automatically. To manage it manually:

```bash
sudo systemctl start   dbadmin
sudo systemctl stop    dbadmin
sudo systemctl restart dbadmin
sudo systemctl status  dbadmin
sudo journalctl -u dbadmin -f      # stream live logs
```

### pm2 (cross-platform Node.js process manager)

```bash
npm install -g pm2

pm2 start server.mjs --name dbadmin
pm2 save                           # persist the process list across reboots
pm2 startup                        # follow the printed command to enable autostart

pm2 restart dbadmin
pm2 logs    dbadmin
```

---

## Development

```bash
npm run dev            # start dev server on port 3333 with hot reload
npm run build          # production build
npm run start          # production server (requires a build first)
npm run generate-cert  # generate a self-signed TLS certificate
```

---

## Security notes

- Passwords for database connections are encrypted at rest with **AES-256-GCM** before being written to `data/connections.json`
- Session tokens are **HMAC-SHA256** signed with a unique `SESSION_SECRET`; sessions expire after 8 hours
- Login is rate-limited to **5 attempts per 15 minutes** per IP
- All row-level SQL uses **parameterised queries**; table and column identifiers are validated and quoted
- Read-only connections block any `INSERT`, `UPDATE`, `DELETE`, `DROP`, or DDL at the application layer
- Security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) are set on every response

---

## Data files

The following files are created at runtime and are excluded from git:

| Path | Contents |
|---|---|
| `.env.local` | Password, session secret, port |
| `data/connections.json` | Saved database connections (passwords AES-encrypted) |
| `data/query-history.json` | Last 500 executed queries |
| `data/saved-queries.json` | Bookmarked SQL queries |
| `certs/cert.pem` | TLS certificate |
| `certs/key.pem` | TLS private key |
