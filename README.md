# SE Work Manager

A Windows desktop app for Solution Engineers to manage territories, accounts, MSX opportunities, customer activities, tasks, and SE work — with MSX import, live sync, and an AI assistant.

## Download (Windows)

**[⬇ Download the latest release (Windows)](https://github.com/amruthasatishkumar/Work-Management/releases/latest)**

See the [Installation Guide](docs/INSTALLATION.md) for step-by-step setup instructions.

---

## Features

- **Territories & Accounts** — Organise accounts by territory with full CRUD
- **Opportunities** — Track deal status (Active / In Progress / Committed / Not Active) with comments, next steps, and completion tracking
- **Activities** — Log customer-facing activities (Demo, Meeting, POC, Architecture Review, Follow up Meeting) with due dates, completion dates, and status (To Do / In Progress / Completed / Blocked)
- **Activity Management** — Kanban board for activities: three columns (In Progress / Completed / Blocked) with a To Do sidebar; drag and drop to update status
- **SE Work** — Kanban board for internal SE tasks with drag-and-drop reordering
- **Dashboard** — At-a-glance stats (Territories, Accounts, Active Opportunities, Remaining Activities, SE Work Not Started, SE Work In Progress) with quick navigation to remaining activities and active opportunities
- **AI Assistant** — Natural language chat interface powered by GitHub Models (GPT-4o mini) with function calling for real-time data queries. Chat history persists for the browser session.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State / Data | TanStack Query |
| Drag & Drop | @dnd-kit |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite (Node.js built-in `node:sqlite`, v22+) |
| AI | OpenAI SDK → GitHub Models (`gpt-4o-mini`) |
| MCP Server | `@modelcontextprotocol/sdk` for GitHub Copilot integration |

---

## Getting Started

### Prerequisites

- Node.js v22+
- A [GitHub Models](https://github.com/marketplace/models) personal access token with model inference access

### 1. Clone the repo

```bash
git clone https://github.com/amruthasatishkumar/Work-Management.git
cd Work-Management
```

### 2. Configure environment

Create `work-management/backend/.env`:

```env
GITHUB_TOKEN=your_github_pat_here
```

### 3. Install dependencies

```bash
# Backend
cd work-management/backend
npm install

# Frontend
cd ../frontend
npm install

# MCP server
cd ../../mcp-server
npm install
```

### 4. Start the app

#### Option A — Silent background launch (recommended, no terminals)

Double-click **`Start App.vbs`** from the repo root or Windows Explorer.

- Starts both the backend (port 3001) and frontend (port 5173) silently in the background — no terminal windows appear
- Automatically opens [http://localhost:5173](http://localhost:5173) in your default browser after ~9 seconds
- Works without VS Code being open

> **Tip:** Right-click `Start App.vbs` → *Send to → Desktop (create shortcut)* for a one-click launch from your desktop.

#### Option B — Visible terminals (useful for debugging)

Double-click **`Start App.bat`** — opens two terminal windows (one for backend, one for frontend) and then opens the browser.

#### Option C — Manual start

```bash
# Terminal 1 — backend
cd work-management/backend
npm run dev

# Terminal 2 — frontend
cd work-management/frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Project Structure

```
work-management/
├── backend/          # Express API + SQLite database
│   ├── src/
│   │   ├── routes/   # REST endpoints + AI chat route
│   │   └── db/       # Database setup & migrations
│   └── data/         # SQLite database file (gitignored)
├── frontend/         # React + Vite SPA
│   └── src/
│       ├── pages/    # Dashboard, Territories, Accounts, Opportunities, Activities, Chat…
│       ├── components/
│       └── lib/      # API client, types, query keys
└── mcp-server/       # MCP server for GitHub Copilot integration
```

---

## Using with GitHub Copilot

The app includes an MCP (Model Context Protocol) server that connects your live work-management data directly to GitHub Copilot in VS Code. You can ask Copilot questions about your accounts, opportunities, activities, tasks, and SE Work without leaving your editor.

### Prerequisites

- [GitHub Copilot](https://github.com/features/copilot) subscription (Individual, Business, or Enterprise)
- VS Code with the **GitHub Copilot** extension installed
- The app already running locally (backend on port 3001, see [Getting Started](#getting-started))

### Setup Steps

**1. Clone and install the MCP server dependencies**

```bash
cd work-management/mcp-server
npm install
```

**2. Verify the MCP server is registered**

The `.vscode/mcp.json` file in this repo already configures the server for VS Code:

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

This file is committed to the repo, so no manual configuration is needed after cloning.

**3. Start the backend** (required — the MCP server reads the same SQLite database)

```bash
cd work-management/backend
npm run dev
```

Or use `Start App.vbs` (silent) or `Start App.bat` (with terminals) to start everything at once.

**4. Enable the MCP server in VS Code**

- Open the Command Palette (`Ctrl+Shift+P`)
- Run **"MCP: List Servers"** and confirm `work-management` appears
- If it shows as stopped, click **Start**

**5. Ask Copilot about your data**

Open GitHub Copilot Chat (`Ctrl+Alt+I`) and switch to **Agent mode** (`@` → select the agent, or use the mode dropdown). Then ask naturally:

> *"Which accounts have had no activity in the last 30 days?"*
> *"Show me all Committed opportunities"*
> *"What activities are due this week?"*
> *"Give me a summary of my SE Work"*

Copilot will use the MCP tools to query your live database and return real-time answers.

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
