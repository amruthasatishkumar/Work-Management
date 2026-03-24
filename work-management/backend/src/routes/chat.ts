import { Router } from 'express';
import OpenAI from 'openai';
import db from '../db/database';

const router = Router();

const client = new OpenAI({
  baseURL: 'https://models.inference.ai.azure.com',
  apiKey: process.env.GITHUB_TOKEN,
});

type SQLValue = string | number | null;

function q(sql: string, params: SQLValue[] = []): unknown[] {
  return db.prepare(sql).all(...params) as unknown[];
}

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_dashboard_summary',
      description: 'Get a summary of all work: opportunity counts by status, task counts, SE Work counts, and recent activity counts.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_accounts',
      description: 'List all accounts with their territory. Optionally filter by territory or search by name.',
      parameters: {
        type: 'object',
        properties: {
          territory: { type: 'string', description: 'Filter by territory name (partial match)' },
          search: { type: 'string', description: 'Search by account name (partial match)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_account',
      description: 'Get full details for one account: its opportunities, recent activities, and open next steps.',
      parameters: {
        type: 'object',
        properties: {
          account_name: { type: 'string', description: 'Account name (partial match)' },
        },
        required: ['account_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_opportunities',
      description: 'List opportunities, optionally filtered by status and/or account name.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Active', 'In Progress', 'Committed', 'Not Active'] },
          account_name: { type: 'string', description: 'Filter by account name (partial match)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_activities',
      description: 'List logged activities. Filter by account, type, status, or date. Use due_date_start/due_date_end to filter by due date (e.g. "due this week"). Use days to filter by activity date recency.',
      parameters: {
        type: 'object',
        properties: {
          account_name: { type: 'string' },
          type: { type: 'string', enum: ['Demo', 'POC', 'Meeting', 'Architecture Review', 'Follow up Meeting', 'Other'] },
          status: { type: 'string', enum: ['To Do', 'In Progress', 'Completed', 'Blocked'] },
          days: { type: 'number', description: 'Only return activities whose activity date (date) is within the last N days' },
          due_date_start: { type: 'string', description: 'Filter by due_date >= this ISO date (YYYY-MM-DD). Use for "due this week" or "due by" queries.' },
          due_date_end: { type: 'string', description: 'Filter by due_date <= this ISO date (YYYY-MM-DD). Use together with due_date_start for a date range.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List personal tasks from the Kanban board.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Todo', 'In Progress', 'Done'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_se_work',
      description: 'List SE Work items from the Kanban board.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_accounts_without_recent_activity',
      description: 'Find accounts that have had no logged activities in the last N days (default 30).',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look back (default: 30)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_milestones',
      description: 'List locally-synced MSX milestones. Filter by opportunity name, account name, or status. Returns milestone name, status, estimated date, owner, monthly usage, category, and associated opportunity. Milestones are only available for opportunities synced from MSX.',
      parameters: {
        type: 'object',
        properties: {
          opportunity_name: { type: 'string', description: 'Filter by opportunity title (partial match)' },
          account_name: { type: 'string', description: 'Filter by account name (partial match)' },
          status: { type: 'string', description: 'Filter by milestone status (partial match, e.g. "On Track", "At Risk")' },
        },
      },
    },
  },
];

function runTool(name: string, args: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'get_dashboard_summary': {
        return JSON.stringify({
          opportunities_by_status: q(`SELECT status, COUNT(*) as count FROM opportunities GROUP BY status ORDER BY status`),
          tasks_by_status: q(`SELECT status, COUNT(*) as count FROM tasks GROUP BY status ORDER BY status`),
          se_work_by_status: q(`SELECT status, COUNT(*) as count FROM se_work GROUP BY status ORDER BY status`),
          activities_last_30_days: q(`SELECT type, COUNT(*) as count FROM activities WHERE date >= date('now','-30 days') GROUP BY type ORDER BY count DESC`),
          upcoming_tasks: q(`SELECT title, priority, due_date FROM tasks WHERE due_date IS NOT NULL AND due_date >= date('now') AND status != 'Done' ORDER BY due_date LIMIT 5`),
        });
      }

      case 'list_accounts': {
        const territory = (args.territory as string) ?? null;
        const search = (args.search as string) ?? null;
        return JSON.stringify(q(
          `SELECT a.id, a.name, a.website, t.name AS territory FROM accounts a
           JOIN territories t ON t.id = a.territory_id
           WHERE (?1 IS NULL OR LOWER(t.name) LIKE LOWER('%'||?1||'%'))
             AND (?2 IS NULL OR LOWER(a.name) LIKE LOWER('%'||?2||'%')
                            OR LOWER(REPLACE(a.name,' ','')) LIKE LOWER('%'||REPLACE(?2,' ','')||'%'))
           ORDER BY t.name, a.name`,
          [territory, search]
        ));
      }

      case 'get_account': {
        const rows = q(
          `SELECT a.*, t.name AS territory FROM accounts a
           JOIN territories t ON t.id = a.territory_id
           WHERE LOWER(a.name) LIKE LOWER('%'||?1||'%')
              OR LOWER(REPLACE(a.name,' ','')) LIKE LOWER('%'||REPLACE(?1,' ','')||'%')
           LIMIT 1`,
          [args.account_name as string]
        ) as any[];
        if (!rows.length) return 'Account not found.';
        const acc = rows[0];
        return JSON.stringify({
          account: acc,
          opportunities: q(
            `SELECT id, title, status, next_steps, updated_at FROM opportunities
             WHERE account_id = ?1 ORDER BY updated_at DESC`,
            [acc.id]
          ),
          recent_activities: q(
            `SELECT type, purpose, date, status, notes FROM activities
             WHERE account_id = ?1 ORDER BY date DESC LIMIT 10`,
            [acc.id]
          ),
          open_next_steps: q(
            `SELECT ns.title, o.title AS opportunity FROM opportunity_next_steps ns
             JOIN opportunities o ON o.id = ns.opportunity_id
             WHERE o.account_id = ?1 AND ns.done = 0`,
            [acc.id]
          ),
        });
      }

      case 'list_opportunities': {
        const status = (args.status as string) ?? null;
        const accountName = (args.account_name as string) ?? null;
        return JSON.stringify(q(
          `SELECT o.title, o.status, o.next_steps, o.updated_at, a.name AS account
           FROM opportunities o JOIN accounts a ON a.id = o.account_id
           WHERE (?1 IS NULL OR o.status = ?1)
             AND (?2 IS NULL OR LOWER(a.name) LIKE LOWER('%'||?2||'%')
                            OR LOWER(REPLACE(a.name,' ','')) LIKE LOWER('%'||REPLACE(?2,' ','')||'%'))
           ORDER BY o.updated_at DESC`,
          [status, accountName]
        ));
      }

      case 'list_activities': {
        const accountName = (args.account_name as string) ?? null;
        const type = (args.type as string) ?? null;
        const status = (args.status as string) ?? null;
        const days = args.days ? Number(args.days) : null;
        const dueDateStart = (args.due_date_start as string) ?? null;
        const dueDateEnd = (args.due_date_end as string) ?? null;
        const dateClause = days !== null ? `AND act.date >= date('now','-${days} days')` : '';
        const dueDateClause = [
          dueDateStart ? `AND act.due_date >= '${dueDateStart}'` : '',
          dueDateEnd   ? `AND act.due_date <= '${dueDateEnd}'`   : '',
        ].join(' ');
        return JSON.stringify(q(
          `SELECT act.type, act.purpose, act.date, act.due_date, act.completed_date, act.status, a.name AS account
           FROM activities act JOIN accounts a ON a.id = act.account_id
           WHERE (?1 IS NULL OR LOWER(a.name) LIKE LOWER('%'||?1||'%')
                            OR LOWER(REPLACE(a.name,' ','')) LIKE LOWER('%'||REPLACE(?1,' ','')||'%'))
             AND (?2 IS NULL OR act.type = ?2)
             AND (?3 IS NULL OR act.status = ?3)
             ${dateClause}
             ${dueDateClause}
           ORDER BY act.due_date ASC, act.date DESC LIMIT 50`,
          [accountName, type, status]
        ));
      }

      case 'list_tasks': {
        const status = (args.status as string) ?? null;
        return JSON.stringify(q(
          `SELECT title, status, priority, due_date FROM tasks
           WHERE (?1 IS NULL OR status = ?1) ORDER BY position`,
          [status]
        ));
      }

      case 'list_se_work': {
        const status = (args.status as string) ?? null;
        return JSON.stringify(q(
          `SELECT title, status, due_date, completion_date FROM se_work
           WHERE (?1 IS NULL OR status = ?1) ORDER BY position`,
          [status]
        ));
      }

      case 'find_accounts_without_recent_activity': {
        const days = args.days ? Number(args.days) : 30;
        return JSON.stringify(q(
          `SELECT a.name, t.name AS territory, MAX(act.date) AS last_activity
           FROM accounts a
           JOIN territories t ON t.id = a.territory_id
           LEFT JOIN activities act ON act.account_id = a.id
           GROUP BY a.id
           HAVING last_activity IS NULL OR last_activity < date('now','-${days} days')
           ORDER BY last_activity ASC`
        ));
      }

      case 'list_milestones': {
        const oppName = (args.opportunity_name as string) ?? null;
        const acctName = (args.account_name as string) ?? null;
        const status = (args.status as string) ?? null;
        return JSON.stringify(q(
          `SELECT m.milestone_number, m.name, m.workload, m.commitment, m.category,
                  m.monthly_use, m.milestone_date, m.status, m.owner, m.synced_at,
                  o.title AS opportunity, a.name AS account
           FROM opportunity_milestones m
           JOIN opportunities o ON o.id = m.opportunity_id
           JOIN accounts a ON a.id = o.account_id
           WHERE (?1 IS NULL OR LOWER(o.title) LIKE LOWER('%'||?1||'%'))
             AND (?2 IS NULL OR LOWER(a.name) LIKE LOWER('%'||?2||'%')
                            OR LOWER(REPLACE(a.name,' ','')) LIKE LOWER('%'||REPLACE(?2,' ','')||'%'))
             AND (?3 IS NULL OR LOWER(m.status) LIKE LOWER('%'||?3||'%'))
           ORDER BY CASE WHEN m.milestone_date IS NULL THEN 1 ELSE 0 END, m.milestone_date ASC`,
          [oppName, acctName, status]
        ));
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Error: ${msg}`;
  }
}

router.post('/', async (req, res) => {
  const { messages } = req.body as { messages: OpenAI.Chat.ChatCompletionMessageParam[] };
  if (!messages?.length) {
    res.status(400).json({ error: 'messages required' });
    return;
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  // Compute Monday–Sunday of the current week (ISO week)
  const dayOfWeek = now.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const weekStart = monday.toISOString().split('T')[0];
  const weekEnd = sunday.toISOString().split('T')[0];
  const systemMessage: OpenAI.Chat.ChatCompletionMessageParam = {
    role: 'system',
    content: `You are a helpful work management assistant. You have access to tools that query the user's work database containing their accounts, opportunities, activities, tasks, SE Work items, and MSX milestones.
Always use the available tools to answer questions — never guess from memory.
Be concise. Use bullet points for lists. Today's date is ${today}. This week runs from ${weekStart} (Monday) to ${weekEnd} (Sunday).
Important: Account names in the database may be written as one word (e.g. "PowerSchool", "Instructure"). When the user mentions an account with spaces or minor spelling variations (e.g. "Power School", "power school"), try the name as-is — the search handles space-stripping automatically. If no results come back, try a shorter keyword (e.g. just "Power" or "School") to find the closest match.
Activities have three date fields: 'date' (the actual/scheduled activity date), 'due_date' (when the activity is due — may be null), and 'completed_date' (when it was completed — may be null). When the user asks about activities "due this week", call list_activities with due_date_start="${weekStart}" and due_date_end="${weekEnd}". For "due by [date]" use due_date_end only. Never use the 'days' parameter for due date queries.`,
  };

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [systemMessage, ...messages];

  try {
    // Agentic loop — keep going until the model stops calling tools (max 5 rounds)
    for (let i = 0; i < 5; i++) {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: chatMessages,
        tools,
        tool_choice: 'auto',
      });

      const msg = response.choices[0].message;
      chatMessages.push(msg);

      if (!msg.tool_calls?.length) {
        res.json({ reply: msg.content ?? '' });
        return;
      }

      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue;
        const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
        const result = runTool(tc.function.name, args);
        chatMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    res.json({ reply: 'Sorry, I could not complete your request.' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Chat route error:', msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
