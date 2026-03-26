import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate the active user database.
 *
 * Priority:
 *  1. DB_PATH env var — explicit override for any scenario
 *  2. Most recently modified UUID.db in %APPDATA%\work-management\
 *     (the Electron app stores each user's DB as <userId>.db there after sign-in)
 */
function findProductionDb(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;

  const appData = process.env.APPDATA;
  if (!appData) throw new Error('APPDATA environment variable is not set');

  const dir = path.join(appData, 'work-management');
  if (!fs.existsSync(dir)) throw new Error(`Work Management data folder not found: ${dir}`);

  // UUID filenames only — excludes dev-user.db and other non-user files
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.db$/i;
  let best: { file: string; mtime: number } | null = null;
  for (const f of fs.readdirSync(dir)) {
    if (!uuidPattern.test(f)) continue;
    const full = path.join(dir, f);
    const mtime = fs.statSync(full).mtimeMs;
    if (!best || mtime > best.mtime) best = { file: full, mtime };
  }
  if (!best) throw new Error(`No user database found in ${dir}. Open the SE Work Manager app first.`);
  return best.file;
}

const DB_PATH = findProductionDb();

let db: DatabaseSync;
try {
  db = new DatabaseSync(DB_PATH, { readOnly: true });
} catch (e) {
  process.stderr.write(`Failed to open DB at ${DB_PATH}: ${e}\n`);
  process.exit(1);
}

// ── helpers ───────────────────────────────────────────────────────────────────

type SQLInputValue = null | string | number | bigint | Uint8Array;

function q(sql: string, params: SQLInputValue[] = []): unknown[] {
  return db.prepare(sql).all(...params) as unknown[];
}

function fmt(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ── server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'work-management', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ── tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_dashboard_summary',
      description:
        'Get a high-level summary of the workspace: opportunity counts by status, task counts, SE Work counts, activity counts in last 30 days, and upcoming due items.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_accounts',
      description:
        'List all accounts with their territory. Optionally filter by territory name or search by account name.',
      inputSchema: {
        type: 'object',
        properties: {
          territory: {
            type: 'string',
            description: 'Filter by territory name (partial, case-insensitive)',
          },
          search: {
            type: 'string',
            description: 'Search by account name (partial, case-insensitive)',
          },
        },
      },
    },
    {
      name: 'get_account',
      description:
        'Get full details for a single account: its opportunities, recent activities (last 15), and open next steps across all opportunities.',
      inputSchema: {
        type: 'object',
        properties: {
          account_name: {
            type: 'string',
            description: 'Account name to look up (partial match)',
          },
          account_id: {
            type: 'number',
            description: 'Exact account ID',
          },
        },
      },
    },
    {
      name: 'list_opportunities',
      description:
        'List opportunities. Filter by status and/or account name. Returns title, status, next_steps text, and last updated date.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['Active', 'In Progress', 'Committed', 'Not Active'],
            description: 'Filter by opportunity status',
          },
          account_name: {
            type: 'string',
            description: 'Filter by account name (partial match)',
          },
        },
      },
    },
    {
      name: 'list_activities',
      description:
        'List logged activities. Filter by account name, activity type, status, and/or recency (last N days).',
      inputSchema: {
        type: 'object',
        properties: {
          account_name: {
            type: 'string',
            description: 'Filter by account name (partial match)',
          },
          type: {
            type: 'string',
            enum: ['Demo', 'POC', 'Meeting', 'Architecture Review', 'Other', 'Task', 'Follow Up'],
            description: 'Filter by activity type',
          },
          status: {
            type: 'string',
            enum: ['Planned', 'In Progress', 'Completed', 'Cancelled'],
            description: 'Filter by activity status',
          },
          days: {
            type: 'number',
            description: 'Only return activities from the last N days',
          },
        },
      },
    },
    {
      name: 'list_tasks',
      description: 'List personal tasks from the Kanban board, optionally filtered by status.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['Todo', 'In Progress', 'Done'],
            description: 'Filter by task status',
          },
        },
      },
    },
    {
      name: 'list_se_work',
      description: 'List SE Work items from the Kanban board, optionally filtered by status.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
            description: 'Filter by SE Work status',
          },
        },
      },
    },
    {
      name: 'find_accounts_without_recent_activity',
      description:
        'Find accounts that have had no logged activities in the last N days (default 30). Useful for spotting neglected accounts.',
      inputSchema: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Number of days to look back (default: 30)',
          },
        },
      },
    },
  ],
}));

// ── tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, unknown>;

  try {
    switch (name) {
      // ── get_dashboard_summary ─────────────────────────────────────────────────
      case 'get_dashboard_summary': {
        const oppsByStatus = q(`SELECT status, COUNT(*) as count FROM opportunities GROUP BY status ORDER BY status`);
        const tasksByStatus = q(`SELECT status, COUNT(*) as count FROM tasks GROUP BY status ORDER BY status`);
        const seWorkByStatus = q(`SELECT status, COUNT(*) as count FROM se_work GROUP BY status ORDER BY status`);
        const activitiesLast30 = q(
          `SELECT type, COUNT(*) as count FROM activities
           WHERE date >= date('now', '-30 days') GROUP BY type ORDER BY count DESC`
        );
        const upcomingTasks = q(
          `SELECT title, status, priority, due_date FROM tasks
           WHERE due_date IS NOT NULL AND due_date >= date('now') AND status != 'Done'
           ORDER BY due_date LIMIT 5`
        );
        const upcomingSeWork = q(
          `SELECT title, status, due_date FROM se_work
           WHERE due_date IS NOT NULL AND due_date >= date('now') AND status NOT IN ('Completed')
           ORDER BY due_date LIMIT 5`
        );
        const [totalAccounts] = q(`SELECT COUNT(*) as count FROM accounts`) as any[];
        const [totalOpps] = q(`SELECT COUNT(*) as count FROM opportunities`) as any[];
        const [totalActivities] = q(`SELECT COUNT(*) as count FROM activities`) as any[];

        return {
          content: [{
            type: 'text',
            text: fmt({
              totals: {
                accounts: totalAccounts.count,
                opportunities: totalOpps.count,
                total_activities: totalActivities.count,
              },
              opportunities_by_status: oppsByStatus,
              tasks_by_status: tasksByStatus,
              se_work_by_status: seWorkByStatus,
              activities_last_30_days_by_type: activitiesLast30,
              upcoming_tasks: upcomingTasks,
              upcoming_se_work: upcomingSeWork,
            }),
          }],
        };
      }

      // ── list_accounts ─────────────────────────────────────────────────────────
      case 'list_accounts': {
        const territory = (a.territory as string) ?? null;
        const search = (a.search as string) ?? null;
        const rows = q(
          `SELECT a.id, a.name, a.website, a.notes, t.name AS territory, a.created_at
           FROM accounts a
           JOIN territories t ON t.id = a.territory_id
           WHERE (? IS NULL OR LOWER(t.name) LIKE LOWER('%' || ? || '%'))
             AND (? IS NULL OR LOWER(a.name) LIKE LOWER('%' || ? || '%'))
           ORDER BY t.name, a.name`,
          [territory, territory, search, search]
        );
        return { content: [{ type: 'text', text: fmt(rows) }] };
      }

      // ── get_account ───────────────────────────────────────────────────────────
      case 'get_account': {
        if (!a.account_id && !a.account_name) {
          return { content: [{ type: 'text', text: 'Provide either account_id or account_name.' }] };
        }
        const where = a.account_id ? 'a.id = ?' : "LOWER(a.name) LIKE LOWER('%' || ? || '%')";
        const param = (a.account_id ?? a.account_name) as SQLInputValue;

        const accounts = q(
          `SELECT a.id, a.name, a.website, a.notes, a.created_at, t.name AS territory
           FROM accounts a JOIN territories t ON t.id = a.territory_id
           WHERE ${where} LIMIT 1`,
          [param]
        ) as any[];

        if (!accounts.length) {
          return { content: [{ type: 'text', text: 'Account not found.' }] };
        }
        const acc = accounts[0];

        const opportunities = q(
          `SELECT id, title, status, description, next_steps, updated_at FROM opportunities
           WHERE account_id = ? ORDER BY updated_at DESC`,
          [acc.id]
        );

        const activities = q(
          `SELECT id, type, purpose, date, status, notes FROM activities
           WHERE account_id = ? ORDER BY date DESC LIMIT 15`,
          [acc.id]
        );

        const openNextSteps = q(
          `SELECT ns.title, ns.done, ns.completion_date, o.title AS opportunity
           FROM opportunity_next_steps ns
           JOIN opportunities o ON o.id = ns.opportunity_id
           WHERE o.account_id = ? AND ns.done = 0
           ORDER BY ns.created_at`,
          [acc.id]
        );

        return {
          content: [{
            type: 'text',
            text: fmt({ account: acc, opportunities, recent_activities: activities, open_next_steps: openNextSteps }),
          }],
        };
      }

      // ── list_opportunities ────────────────────────────────────────────────────
      case 'list_opportunities': {
        const status = (a.status as string) ?? null;
        const accountName = (a.account_name as string) ?? null;
        const rows = q(
          `SELECT o.id, o.title, o.status, o.description, o.next_steps, o.updated_at,
                  acc.name AS account_name, t.name AS territory
           FROM opportunities o
           JOIN accounts acc ON acc.id = o.account_id
           JOIN territories t ON t.id = acc.territory_id
           WHERE (? IS NULL OR o.status = ?)
             AND (? IS NULL OR LOWER(acc.name) LIKE LOWER('%' || ? || '%'))
           ORDER BY o.updated_at DESC`,
          [status, status, accountName, accountName]
        );
        return { content: [{ type: 'text', text: fmt(rows) }] };
      }

      // ── list_activities ───────────────────────────────────────────────────────
      case 'list_activities': {
        const accountName = (a.account_name as string) ?? null;
        const type = (a.type as string) ?? null;
        const status = (a.status as string) ?? null;
        const days = a.days ? Number(a.days) : null;

        // Build date clause safely — days is validated as a number above
        const dateClause = days !== null ? `AND act.date >= date('now', '-${days} days')` : '';

        const rows = q(
          `SELECT act.id, act.type, act.purpose, act.date, act.status, act.notes,
                  acc.name AS account_name, opp.title AS opportunity
           FROM activities act
           JOIN accounts acc ON acc.id = act.account_id
           LEFT JOIN opportunities opp ON opp.id = act.opportunity_id
           WHERE (? IS NULL OR LOWER(acc.name) LIKE LOWER('%' || ? || '%'))
             AND (? IS NULL OR act.type = ?)
             AND (? IS NULL OR act.status = ?)
             ${dateClause}
           ORDER BY act.date DESC
           LIMIT 100`,
          [accountName, accountName, type, type, status, status]
        );
        return { content: [{ type: 'text', text: fmt(rows) }] };
      }

      // ── list_tasks ────────────────────────────────────────────────────────────
      case 'list_tasks': {
        const status = (a.status as string) ?? null;
        const rows = q(
          `SELECT id, title, description, status, priority, due_date FROM tasks
           WHERE (? IS NULL OR status = ?)
           ORDER BY position, due_date`,
          [status, status]
        );
        return { content: [{ type: 'text', text: fmt(rows) }] };
      }

      // ── list_se_work ──────────────────────────────────────────────────────────
      case 'list_se_work': {
        const status = (a.status as string) ?? null;
        const rows = q(
          `SELECT id, title, status, due_date, completion_date FROM se_work
           WHERE (? IS NULL OR status = ?)
           ORDER BY position`,
          [status, status]
        );
        return { content: [{ type: 'text', text: fmt(rows) }] };
      }

      // ── find_accounts_without_recent_activity ─────────────────────────────────
      case 'find_accounts_without_recent_activity': {
        const days = a.days ? Number(a.days) : 30;
        const rows = q(
          `SELECT a.id, a.name, t.name AS territory,
                  MAX(act.date) AS last_activity_date
           FROM accounts a
           JOIN territories t ON t.id = a.territory_id
           LEFT JOIN activities act ON act.account_id = a.id
           GROUP BY a.id
           HAVING last_activity_date IS NULL
              OR last_activity_date < date('now', '-${days} days')
           ORDER BY last_activity_date ASC`
        );
        return { content: [{ type: 'text', text: fmt(rows) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error executing tool "${name}": ${msg}` }] };
  }
});

// ── start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
