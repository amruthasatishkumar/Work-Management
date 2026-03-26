# SE Work Manager

A Windows desktop app for Solution Engineers to manage territories, accounts, MSX opportunities, customer activities, tasks, and SE work — with MSX import, live sync, and an AI assistant.

## Download (Windows)

**[⬇ Download the latest release (Windows)](https://github.com/amruthasatishkumar/Work-Management/releases/latest)**

Download `SE-Work-Manager-Setup-x.x.x.exe` from the latest release, run it, and sign in with your Microsoft account. That's it — no Node.js, no terminal required.

---

## Features

- **Territories & Accounts** — Organise accounts by territory with full CRUD
- **Opportunities** — Track deal status (Active / In Progress / Committed / Not Active) with comments, next steps, and milestone tracking
- **Activities** — Log customer-facing activities (Demo, Meeting, POC, Architecture Review, Follow up Meeting) with due dates, completion dates, and status (To Do / In Progress / Completed / Blocked)
- **Activity Board** — Kanban-style board with drag-and-drop to update status
- **SE Work** — Kanban board for internal SE tasks with drag-and-drop reordering
- **Dashboard** — At-a-glance stats with quick navigation to remaining activities and active opportunities
- **AI Assistant** — Natural language chat powered by GitHub Models (GPT-4o mini) with function calling for real-time data queries
- **OneDrive Backup** — Daily automatic backup of your database to OneDrive; auto-restores on a fresh install

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 34 (Node.js 22) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State / Data | TanStack Query |
| Drag & Drop | @dnd-kit |
| Backend | Node.js + Express + TypeScript (bundled via esbuild) |
| Database | SQLite via `node-sqlite3-wasm` (pure WASM, no native compilation) |
| Auth | Microsoft Entra ID (org-restricted sign-in via MSAL) |
| AI | OpenAI SDK → GitHub Models (`gpt-4o-mini`) |
| MCP Server | `@modelcontextprotocol/sdk` for GitHub Copilot integration |

---

## Installation

### Installed app (recommended)

1. Go to **[Releases](https://github.com/amruthasatishkumar/Work-Management/releases/latest)**
2. Download `SE-Work-Manager-Setup-x.x.x.exe`
3. Run the installer (click through the Windows SmartScreen prompt if it appears — the app is not code-signed)
4. Launch **SE Work Manager** from the Start menu or Desktop shortcut
5. Sign in with your Microsoft work account
6. On first launch you will be prompted to enter an optional **GitHub personal access token** for the AI assistant

The app stores your database in `%APPDATA%\work-management\<userId>.db` and backs it up automatically to OneDrive.

### Updating

Download and run the new installer — it installs over the previous version and preserves your data.

---

## Development Setup

### Prerequisites

- Node.js v22+
- A [GitHub Models](https://github.com/marketplace/models) personal access token (for the AI assistant)

### 1. Clone the repo

```bash
git clone https://github.com/amruthasatishkumar/Work-Management.git
cd "Work Management"
```

### 2. Configure environment

Create `work-management/backend/.env`:

```env
GITHUB_TOKEN=your_github_pat_here
```

### 3. Install dependencies

```bash
# Root (Electron + electron-builder)
npm install

# Backend
npm install --prefix work-management/backend

# Frontend
npm install --prefix work-management/frontend
```

### 4. Run in development mode

```bash
npm run electron:dev
```

This starts the backend (port 3001) and frontend (port 5173) concurrently, then launches Electron once both are ready. Sign-in is bypassed in dev mode — a `dev-user` identity is used automatically.

### 5. Build a local installer

```bash
npm run electron:build
```

Output: `dist-electron/SE-Work-Manager-Setup-x.x.x.exe`

---

## Releasing a New Version

Releases are built automatically by GitHub Actions on any pushed `v*` tag, or manually via **Actions → Build and Release → Run workflow**.

### Tag-based release (recommended)

```bash
git tag v1.2.3
git push origin v1.2.3
```

### Manual release from GitHub UI

1. Go to **Actions → Build and Release**
2. Click **Run workflow**
3. Enter the version (e.g. `v1.2.3`) and choose `release` or `pre-release`
4. Click **Run workflow**

The workflow builds the NSIS installer on `windows-latest`, then publishes it to GitHub Releases automatically.

---

## Project Structure

```
Work Management/
├── electron/                  # Electron main process
│   ├── main.js                # App entry, auth, backend startup, window management
│   ├── preload.js             # Context bridge
│   ├── loading.html           # Splash screen
│   ├── token-prompt.html      # GitHub token setup dialog
│   └── services/
│       └── auth.js            # MSAL sign-in flow
├── work-management/
│   ├── backend/               # Express API (bundled with esbuild)
│   │   └── src/
│   │       ├── routes/        # REST endpoints + AI chat route
│   │       └── db/            # SQLite setup, schema, migrations
│   ├── frontend/              # React + Vite SPA
│   │   └── src/
│   │       ├── pages/         # Dashboard, Territories, Accounts, Opportunities, Activities, Chat…
│   │       ├── components/
│   │       └── lib/           # API client, types, query keys
│   └── mcp-server/            # MCP server for GitHub Copilot integration
├── assets/                    # App icon
├── scripts/
│   └── set-version.js         # Updates package.json versions for CI builds
├── electron-builder.yml       # Electron packaging config
└── package.json               # Root — Electron, electron-builder, concurrently
```

---

## Using with GitHub Copilot (MCP)

The repo includes an MCP (Model Context Protocol) server that connects your live data directly to GitHub Copilot in VS Code.

### Prerequisites

- [GitHub Copilot](https://github.com/features/copilot) subscription
- VS Code with the **GitHub Copilot** extension
- The app running (either the installed Electron app, or `npm run electron:dev`)

### Setup

**1. Install MCP server dependencies**

```bash
npm install --prefix work-management/mcp-server
```

**2. Verify VS Code config**

`.vscode/mcp.json` is already committed and configures the server automatically:

```json
{
  "servers": {
    "work-management": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "work-management/mcp-server/src/index.ts"]
    }
  }
}
```

**3. Enable in VS Code**

- Open Command Palette (`Ctrl+Shift+P`) → **MCP: List Servers**
- Confirm `work-management` appears; if stopped, click **Start**

**4. Ask Copilot about your data**

Open Copilot Chat (`Ctrl+Alt+I`) in **Agent mode** and ask naturally:

> *"Which accounts have had no activity in the last 30 days?"*
> *"Show me all Committed opportunities"*
> *"What activities are due this week?"*
> *"Give me a summary of my SE Work"*

### Available MCP Tools

| Tool | What it does |
|------|-------------|
| `get_dashboard_summary` | Counts across opportunities, activities, and SE Work |
| `list_accounts` | All accounts, filterable by territory or name |
| `get_account` | Full detail for one account (opps, activities, next steps) |
| `list_opportunities` | Opportunities by status and/or account |
| `list_activities` | Activities by status, type, account, or due date range |
| `list_se_work` | SE Work items by status |
| `find_accounts_without_recent_activity` | Accounts with no activity in the last N days |
