# SE Work Manager

A Windows desktop app for Solution Engineers to manage territories, accounts, MSX opportunities, customer activities, milestones, tasks, and SE work — with live MSX sync, an AI assistant, and GitHub Copilot integration via MCP.

## Download & Install (Windows)

**[⬇ Download the latest release (Windows)](https://github.com/amruthasatishkumar/Work-Management/releases/latest)**

Download the `.exe` installer, run it, and the app installs and launches automatically. Updates are delivered silently in the background — you'll see a prompt to restart when one is ready.

---

## How to Use

### First launch

When you first open the app you'll land on the **Dashboard**. It's empty until you either manually add data or import from MSX. For most SEs, **MSX Import** is the fastest way to get started.

---

### MSX Import

Open **MSX Import** from the left nav. The status indicator at the top shows whether your MSX token is valid. If it shows red, open a terminal and run `az login`, then reload.

**Three ways to import:**

| Method | How |
|--------|-----|
| **By TPID** | Paste one or more TPIDs (comma-separated). Pulls the parent account and all open opportunities for each TPID. |
| **By URL** | Paste a direct MSX opportunity URL or bare GUID to import a single opportunity and its parent account. |
| **Deal Team** | Click "Load My Deal Teams" to pull every open opportunity where you are on the deal team. |

After loading, a preview shows accounts → opportunities → activities → comments → milestones. Select what you want and click **Import Selected**. Duplicate opportunities already in your local database are skipped automatically.

> Use the **refresh button** on any Opportunity detail page to re-pull the latest comments, activities, and milestones from MSX at any time.

---

### Dashboard

Live snapshot of your work:

- **Stats** — Territories, Accounts, Total Opportunities, Active Opportunities, Total Activities, Remaining Activities, SE Work Not Started, SE Work In Progress
- **Remaining Activities** — incomplete activities sorted by due date, click any to open
- **Active Opportunities** — current open deals, click any to open the detail page

---

### Territories

Top level of the data hierarchy. Every account belongs to a territory.

- Add, rename, or delete territories
- Deleting a territory cascades — removes all accounts, opportunities, and activities underneath it

---

### Accounts

Accounts sit under territories and link to opportunities and activities.

- Filter the list by territory
- Click an account to open its **detail page**, which shows:
  - All opportunities for that account
  - Recent activities
  - **Plan of Action** — a freeform notes field for your strategic thoughts on this account
- Accounts imported from MSX also store the TPID and MSX account ID for sync

---

### Opportunities

All deals across your territories.

- **Cascading filters** — Territory → Account → Status. Statuses are pulled dynamically from your actual data.
- Click an opportunity title to open its **detail page**:
  - Description, link, solution play, status, estimated close date
  - **Comments** — forecast comments imported from MSX
  - **Next Steps** — action items with completion tracking
  - **Plan of Action** — freeform notes field
  - **View Milestones** button — opens the live D365 milestone view for this opportunity
  - **MSX refresh button** — re-syncs comments, activities, and milestones from D365

#### Milestone View (per Opportunity)

Opened via **View Milestones** on any opportunity. Requires a valid MSX token.

- Fetches milestones live from D365 — shows milestone number, name, workload, commitment, category, status, date, and owner
- **Join / Leave team** — add or remove yourself from the milestone team directly
- **Create HoK Task** — create a D365 task linked to a milestone, with task category and due date
- Filter by milestone name or status
- Syncs `on_team` status back to your local database so the AI assistant can reference it

---

### Activities

Customer-facing activities linked to accounts or opportunities.

- **Types**: Demo, Meeting, POC, Architecture Review, Follow up Meeting, Other
- **Statuses**: To Do, In Progress, Completed, Blocked
- **Filters**: type, status, or opportunity
- Click an activity to open its detail page with notes, comments, and full history
- **Push to MSX** — syncs the activity as a D365 task linked to its opportunity
- **Delete from MSX** — removes the D365 task (only tasks you created)

---

### Activity Management (Kanban)

Kanban board view of all activities.

- **Columns**: To Do sidebar → In Progress → Completed → Blocked
- Drag cards between columns to update status
- Drag within a column to reorder

---

### SE Work

Internal SE tasks not tied to a specific customer account.

- **Statuses**: Not Started, In Progress, Blocked, Done
- Full kanban layout with drag-and-drop reorder within each column

---

### AI Assistant

Natural language chat powered by **GitHub Models (GPT-4o mini)** with function calling.

Ask questions about your data in plain English:

> *"Which accounts haven't had any activity this month?"*  
> *"Show me all Committed opportunities"*  
> *"What's due this week?"*  
> *"Summarise my SE Work in progress"*

The assistant queries your live local database to answer — no data is sent to a third party beyond the question text. Requires a GitHub Models personal access token configured in the backend `.env`.

---

### Auto-updater

The app checks for new GitHub releases on startup. When an update is downloaded a banner appears in the sidebar — click **Restart & Update** to apply it, or it applies automatically on next launch.

---

## Installation from Source

### Prerequisites

- Node.js v22+
- A [GitHub Models](https://github.com/marketplace/models) personal access token with model inference access

### 1. Clone

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
cd work-management/backend && npm install
cd ../frontend && npm install
cd ../../mcp-server && npm install
```

### 4. Run

```bash
# Terminal 1 — backend (port 3001)
cd work-management/backend
npm run dev

# Terminal 2 — frontend (port 5173)
cd work-management/frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Project Structure

```
Work-Management/
├── electron/                   # Electron main process + preload
├── work-management/
│   ├── backend/                # Express API + SQLite database
│   │   ├── src/
│   │   │   ├── routes/         # accounts, opportunities, activities, milestones,
│   │   │   │                     msx, se-work, tasks, chat, dashboard
│   │   │   └── db/             # database.ts — schema + migrations
│   │   └── data/               # SQLite .db file (gitignored)
│   ├── frontend/               # React 18 + Vite SPA
│   │   └── src/
│   │       ├── pages/          # One file per page/view
│   │       ├── components/     # Layout, shared UI, panels
│   │       └── lib/            # api.ts, types.ts, queryKeys.ts
│   └── mcp-server/             # MCP server for GitHub Copilot integration
├── electron-builder.yml        # Electron build + release config
└── package.json                # Root entry point
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State / Data fetching | TanStack Query |
| Drag & Drop | @dnd-kit |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite (`node-sqlite3-wasm`) |
| AI Assistant | OpenAI SDK → GitHub Models (`gpt-4o-mini`) |
| MSX / D365 | Microsoft Dynamics 365 OData v9.2 API |
| MCP Server | `@modelcontextprotocol/sdk` — GitHub Copilot integration |

---

## Using with GitHub Copilot (MCP)

The app ships with an MCP server that connects your live data directly to GitHub Copilot in VS Code.

### Setup

**1. Install MCP server dependencies**

```bash
cd work-management/mcp-server
npm install
```

**2. The MCP config is already committed** — `.vscode/mcp.json` registers the server automatically:

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

**3. Enable it**: `Ctrl+Shift+P` → **MCP: List Servers** → confirm `work-management` is running.

**4. Ask Copilot in Agent mode:**

> *"Which accounts have had no activity in the last 30 days?"*  
> *"Show me all Committed opportunities"*  
> *"What activities are due this week?"*  
> *"Give me a summary of my SE Work"*

### Available MCP Tools

| Tool | What it does |
|------|-------------|
| `get_dashboard_summary` | Stats across opportunities, activities, and SE Work |
| `list_accounts` | All accounts, filterable by territory or name |
| `get_account` | Full detail for one account including opps and activities |
| `list_opportunities` | Opportunities filterable by status and/or account |
| `list_activities` | Activities filterable by status, type, account, or date range |
| `list_se_work` | SE Work items by status |
| `find_accounts_without_recent_activity` | Accounts with no activity in the last N days |
