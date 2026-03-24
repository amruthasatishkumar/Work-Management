# Work Management — Personal CRM & Task Hub

A self-hosted work management app for tracking accounts, opportunities, activities, tasks, and SE Work — with a built-in AI assistant powered by GitHub Models.

---

## Features

- **Accounts & Territories** — Organize accounts by sales territory
- **Opportunities** — Track deals with statuses: Active, In Progress, Committed, Not Active
- **Activities** — Log meetings, demos, POCs, follow-ups, and more
- **Tasks** — Kanban board (To Do / In Progress / Done)
- **SE Work** — Kanban board for SE-specific work (Not Started / In Progress / Completed / Blocked)
- **AI Assistant** — Chat with your data using GitHub Models (GPT-4o mini)
- **MCP Server** — Connect GitHub Copilot in VS Code directly to your database

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, dnd-kit |
| Backend | Node.js, Express, TypeScript, node:sqlite (built-in) |
| AI | OpenAI SDK → GitHub Models (GPT-4o mini) |
| MCP | @modelcontextprotocol/sdk, tsx |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v22 or later (required for built-in SQLite)
- A [GitHub account](https://github.com) with [GitHub Copilot](https://github.com/features/copilot) access (for AI features)
- [VS Code](https://code.visualstudio.com/) (for MCP/Copilot integration)

---

## Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd work-management
```

### 2. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# MCP server
cd ../mcp-server
npm install
```

### 3. Configure the AI assistant

The AI chat feature uses **GitHub Models**, which is free with your GitHub Copilot subscription.

**Generate a GitHub Personal Access Token:**
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Give it any name (e.g. `work-management-chat`)
4. No scopes needed — just click **Generate token**
5. Copy the token

**Create the backend environment file:**

```bash
# In the backend/ folder
cp .env.example .env
```

Open `backend/.env` and replace `your_github_pat_here` with your token:

```
GITHUB_TOKEN=ghp_your_token_here
```

### 4. Start the app

Open two terminals:

```bash
# Terminal 1 — Backend (port 3001)
cd backend
npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## MCP Server (Copilot in VS Code)

The MCP server lets you ask questions about your data directly in **GitHub Copilot Chat** inside VS Code.

### Setup

The `.vscode/mcp.json` config file is already included. Just open this workspace folder in VS Code — it will automatically start the MCP server.

### Usage

1. Open Copilot Chat (`Ctrl+Alt+I`)
2. Switch to **Agent mode** using the dropdown near the input box
3. Ask questions like:
   - *"Which accounts have no activity in the last 30 days?"*
   - *"Show me all Committed opportunities"*
   - *"What tasks do I have In Progress?"*

---

## Project Structure

```
work-management/
├── backend/
│   ├── src/
│   │   ├── db/           # SQLite schema + migrations
│   │   ├── routes/       # Express API routes
│   │   └── index.ts      # Server entry point
│   ├── data/             # SQLite database file (gitignored)
│   └── .env              # Your GitHub token (gitignored)
├── frontend/
│   └── src/
│       ├── pages/        # React page components
│       ├── components/   # Shared UI components
│       └── lib/          # API client, types, query keys
├── mcp-server/
│   └── src/index.ts      # MCP server with 8 data tools
└── .vscode/
    └── mcp.json          # VS Code MCP registration
```

---

## Database

The SQLite database is created automatically on first run at `backend/data/workmanagement.db`. It is **gitignored** — your data stays on your machine and is never committed to the repository.

Schema migrations run automatically on startup — no manual migration steps needed.

---

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `GITHUB_TOKEN` | `backend/.env` | GitHub PAT for GitHub Models AI chat |

The `.env` file is **gitignored** and never committed.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/territories` | Territories CRUD |
| GET/POST | `/api/accounts` | Accounts CRUD |
| GET/POST | `/api/opportunities` | Opportunities CRUD |
| GET/POST | `/api/activities` | Activities CRUD |
| PATCH | `/api/activities/:id/kanban` | Move activity to Kanban column |
| GET/POST | `/api/tasks` | Tasks CRUD |
| PATCH | `/api/tasks/:id/status` | Update task status + position |
| GET/POST | `/api/se-work` | SE Work CRUD |
| PATCH | `/api/se-work/:id/status` | Update SE Work status |
| POST | `/api/chat` | AI chat with function calling |
| GET | `/api/dashboard` | Dashboard summary stats |
