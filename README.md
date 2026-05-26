# LTCM — Lightweight Test Case Manager

![version](https://img.shields.io/badge/version-3.1.0-6366f1?style=flat-square)
![license](https://img.shields.io/github/license/CorithLabs/LTCM?style=flat-square&color=6366f1)
![node](https://img.shields.io/badge/node-20+-339933?style=flat-square&logo=node.js&logoColor=white)
![postgres](https://img.shields.io/badge/postgresql-16-4169e1?style=flat-square&logo=postgresql&logoColor=white)
![docker](https://img.shields.io/badge/docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![last commit](https://img.shields.io/github/last-commit/CorithLabs/LTCM?style=flat-square&color=22c55e)

Ship with **QA-nfidence.** A self-hosted, open source test case manager for small QA teams — write cases, run sessions, log results, export reports.

```mermaid
sequenceDiagram
    actor PO as 🧑‍💼 Product Owner
    actor Dev as 🧑‍💻 Developer
    actor QA as 🧪 QA Engineer

    PO->>Dev: Here's a ticket. Ship it by Friday.
    Dev->>Dev: Ships it by Friday 🚀
    PO->>QA: Can you test this?
    QA->>QA: Opens Excel 😭
    QA->>QA: Tries to remember test cases from last sprint
    Note over QA: There has to be a better way...
    QA->>QA: Finds LTCM on GitHub ⭐
    QA->>Dev: 47 test cases written. Run started.
    Dev->>Dev: Sweating 😰
    QA->>Dev: TC-12 FAILED — steps to reproduce attached
    QA->>Dev: TC-23 FAILED — here's the Jira ticket
    QA->>Dev: TC-31 FAILED — and this one too
    Dev->>PO: Friday won't work anymore 🙃
    PO->>QA: Can you go easy on him?
    QA->>PO: Run report exported. 31 passed, 16 failed.
    Note over PO,QA: Shipped the right way. Eventually. ✅
```

---

## Quick Start — Docker (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/CorithLabs/LTCM.git
cd LTCM

# Copy env template and set your secrets
cp .env.example .env.local
# Edit SESSION_SECRET at minimum before running in production

docker compose up -d
```

Open **http://localhost:3050**

Default admin credentials: `admin` / `admin` — you'll be prompted to change the password on first login.

To stop: `docker compose down`
To update: `git pull && docker compose up -d --build`

---

## Manual Setup (no Docker)

**Requirements:** Node.js 20+, PostgreSQL 14+

```bash
git clone https://github.com/CorithLabs/LTCM.git
cd LTCM

# 1. Create the database
createdb ltcm

# 2. Copy env template and configure
cp .env.example .env.local
# Edit DATABASE_URL and SESSION_SECRET

# 3. Install dependencies and build the frontend
npm run setup

# 4. Start
npm start
```

Open **http://localhost:3000**

---

## Development

```bash
# Install deps (root + client)
npm run setup

# Start backend + Vite dev server concurrently
npm run dev
```

- Backend: http://localhost:3000 (API)
- Frontend: http://localhost:5173 (hot reload, proxies API to :3000)

---

## Environment Variables

Copy `.env.example` to `.env.local` and adjust:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `SESSION_SECRET` | Yes | Long random string for session signing |
| `PORT` | No | Server port (default: `3000`) |
| `JIRA_ENCRYPTION_KEY` | No | Auto-generated on first run if not set |

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Deployment Architecture

```mermaid
graph TD
    User["👤 Browser / CI Script"]

    subgraph Docker Compose
        App["🟢 app\n(Node.js 20 · Express)\nport 3000 internal"]
        DB["🐘 postgres\n(PostgreSQL 16)\nport 5432 internal"]
    end

    Volume1[("📦 pgdata\nPostgreSQL data")]
    Volume2[("📁 appdata\nAttachments · Logs")]

    Jira["☁️ Jira Cloud\n(optional)"]

    User -->|"HTTP :3050 (HOST_PORT)"| App
    App -->|"SQL queries"| DB
    App -->|"REST API proxy"| Jira
    DB --- Volume1
    App --- Volume2
```

> The app container serves both the API and the pre-built React frontend.
> PostgreSQL and app data are persisted in named Docker volumes — safe across `docker compose down` and restarts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express 4, PostgreSQL (via `pg`) |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Query |
| Auth | Session-based (express-session + connect-pg-simple) |
| File storage | Local disk (`data/attachments/`) |

---

## Features

- Multi-user with roles (admin / tester)
- Projects → Suites → Test Cases hierarchy
- Test run sessions with Pass / Fail / Skip / Blocked / N/A per case
- Auto-save during runs (500ms debounce)
- Run history with vs-last-run diff
- CSV and HTML/PDF export
- Jira integration — link cases to issues, auto-transition on result
- Full-text search
- Backup & restore (JSON)
- Admin: user management, access logs, app logs
