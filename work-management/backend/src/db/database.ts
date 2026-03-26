import { Database as WasmDatabase } from 'node-sqlite3-wasm';
import path from 'path';
import fs from 'fs';

// In production (Electron), DB_PATH is set by main.js to AppData/{userId}.db
// In development it falls back to the local data/ directory
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'workmanagement.db');
const DATA_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Remove stale WAL sidecar files left by previous better-sqlite3 sessions.
// node-sqlite3-wasm's WASM VFS never creates these, so it's always safe to delete them.
for (const suffix of ['-shm', '-wal', '-journal']) {
  try { fs.unlinkSync(DB_PATH + suffix); } catch { /* doesn't exist, ignore */ }
}

// Open the database. If it fails (e.g. the existing file has WAL mode baked into
// its SQLite header from an old better-sqlite3 session — incompatible with the
// WASM VFS which has no shared-memory support), delete and recreate from scratch.
// All CREATE TABLE IF NOT EXISTS + migration code below handles re-initialisation.
let _db: WasmDatabase;
try {
  _db = new WasmDatabase(DB_PATH);
  _db.exec('SELECT 1'); // verify the connection is actually usable
} catch {
  console.warn('[database] Could not open existing DB (likely WAL header mismatch); recreating from scratch.');
  try { fs.unlinkSync(DB_PATH); } catch { /* file doesn't exist */ }
  _db = new WasmDatabase(DB_PATH);
}

// Shim: wraps node-sqlite3-wasm's Statement so callers can use the
// better-sqlite3 spread-args style: db.prepare(sql).all(a, b, c)
function makeStmtShim(sql: string) {
  return {
    all(...args: unknown[]) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return _db.all(sql, params as any);
    },
    get(...args: unknown[]) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return _db.get(sql, params as any);
    },
    run(...args: unknown[]) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return _db.run(sql, params as any);
    },
  };
}

const db = {
  prepare: (sql: string) => makeStmtShim(sql),
  exec: (sql: string) => _db.exec(sql),
};

// Enable foreign key enforcement
db.exec('PRAGMA foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS territories (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    territory_id INTEGER NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    website      TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS opportunities (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    link         TEXT,
    status       TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Committed','In Progress','Active','Not Active')),
    next_steps   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    opportunity_id  INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
    type            TEXT NOT NULL CHECK(type IN ('Demo','Meeting','POC','Architecture Review','Follow up Meeting','Other')),
    purpose         TEXT NOT NULL,
    date            TEXT NOT NULL,
    due_date        TEXT,
    status          TEXT NOT NULL DEFAULT 'To Do' CHECK(status IN ('To Do','In Progress','Completed','Blocked')),
    notes           TEXT,
    completed_date  TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'Todo' CHECK(status IN ('Todo','In Progress','Done')),
    priority    TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High')),
    due_date    TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS opportunity_comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id  INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS opportunity_next_steps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id  INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    done            INTEGER NOT NULL DEFAULT 0,
    completion_date TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS se_work (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    due_date        TEXT,
    completion_date TEXT,
    status          TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started','In Progress','Completed','Blocked')),
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS opportunity_milestones (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id   INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    msx_id           TEXT NOT NULL UNIQUE,
    milestone_number TEXT,
    name             TEXT,
    workload         TEXT,
    commitment       TEXT,
    category         TEXT,
    monthly_use      REAL,
    milestone_date   TEXT,
    status           TEXT,
    owner            TEXT,
    synced_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Migrations for existing databases ---
function runMigrations() {
  // 1. Opportunities: remap old statuses (Won/Lost/On Hold → Committed/Not Active/In Progress)
  const oppRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='opportunities'").get() as any;
  const oppSql: string = oppRow?.sql ?? '';
  if (oppSql.includes("'Won'")) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`CREATE TABLE opportunities_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT,
      link         TEXT,
      status       TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Committed','In Progress','Active','Not Active')),
      next_steps   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`INSERT INTO opportunities_new (id, account_id, title, description, link, status, next_steps, created_at, updated_at)
      SELECT id, account_id, title, description, link,
        CASE status
          WHEN 'Won'     THEN 'Committed'
          WHEN 'Lost'    THEN 'Not Active'
          WHEN 'On Hold' THEN 'In Progress'
          ELSE status
        END,
        next_steps, created_at, updated_at
      FROM opportunities`);
    db.exec('DROP TABLE opportunities');
    db.exec('ALTER TABLE opportunities_new RENAME TO opportunities');
    db.exec('PRAGMA foreign_keys = ON');
  }

  // 2. Activities: add kanban_column and new type values (Task, Follow Up)
  const actRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='activities'").get() as any;
  const actSql: string = actRow?.sql ?? '';
  const actCols = db.prepare('PRAGMA table_info(activities)').all() as any[];
  const hasKanban = actCols.some((c: any) => c.name === 'kanban_column');
  const hasTaskType = actSql.includes("'Task'");

  if ((!hasKanban || !hasTaskType) && !actSql.includes("'To Do'")) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`CREATE TABLE activities_new (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      opportunity_id  INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
      type            TEXT NOT NULL CHECK(type IN ('Demo','POC','Meeting','Architecture Review','Other','Task','Follow Up')),
      purpose         TEXT NOT NULL,
      date            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'Planned' CHECK(status IN ('Planned','In Progress','Completed','Cancelled','Follow Up')),
      notes           TEXT,
      kanban_column   TEXT CHECK(kanban_column IN ('Todo','In Progress','Done')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    if (hasKanban) {
      db.exec('INSERT INTO activities_new SELECT id,account_id,opportunity_id,type,purpose,date,status,notes,kanban_column,created_at,updated_at FROM activities');
    } else {
      db.exec('INSERT INTO activities_new (id,account_id,opportunity_id,type,purpose,date,status,notes,created_at,updated_at) SELECT id,account_id,opportunity_id,type,purpose,date,status,notes,created_at,updated_at FROM activities');
    }
    db.exec('DROP TABLE activities');
    db.exec('ALTER TABLE activities_new RENAME TO activities');
    db.exec('PRAGMA foreign_keys = ON');
  }

  // 3. Activities: update type CHECK and status CHECK to latest values
  const actRow2 = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='activities'").get() as any;
  const actSql2: string = actRow2?.sql ?? '';
  const needsTypeUpdate = (!actSql2.includes("'Follow up Meeting'") || actSql2.includes("'Task'")) && !actSql2.includes("'To Do'");
  if (needsTypeUpdate) {
    db.exec('PRAGMA foreign_keys = OFF');
    const actCols2 = db.prepare('PRAGMA table_info(activities)').all() as any[];
    const hasKanban2 = actCols2.some((c: any) => c.name === 'kanban_column');
    db.exec(`CREATE TABLE activities_v3 (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      opportunity_id  INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
      type            TEXT NOT NULL CHECK(type IN ('Demo','Meeting','POC','Architecture Review','Follow up Meeting','Other')),
      purpose         TEXT NOT NULL,
      date            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'Planned' CHECK(status IN ('Planned','In Progress','Completed','Cancelled','Follow Up')),
      notes           TEXT,
      kanban_column   TEXT CHECK(kanban_column IN ('Todo','In Progress','Done')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    if (hasKanban2) {
      db.exec(`INSERT INTO activities_v3 SELECT id,account_id,opportunity_id,
        CASE type WHEN 'Task' THEN 'Other' WHEN 'Follow Up' THEN 'Follow up Meeting' ELSE type END,
        purpose,date,status,notes,kanban_column,created_at,updated_at FROM activities`);
    } else {
      db.exec(`INSERT INTO activities_v3 (id,account_id,opportunity_id,type,purpose,date,status,notes,created_at,updated_at)
        SELECT id,account_id,opportunity_id,
        CASE type WHEN 'Task' THEN 'Other' WHEN 'Follow Up' THEN 'Follow up Meeting' ELSE type END,
        purpose,date,status,notes,created_at,updated_at FROM activities`);
    }
    db.exec('DROP TABLE activities');
    db.exec('ALTER TABLE activities_v3 RENAME TO activities');
    db.exec('PRAGMA foreign_keys = ON');
  }

  // 4. opportunity_next_steps: add completion_date column if missing
  const stepCols = db.prepare('PRAGMA table_info(opportunity_next_steps)').all() as any[];
  if (!stepCols.some((c: any) => c.name === 'completion_date')) {
    db.exec('ALTER TABLE opportunity_next_steps ADD COLUMN completion_date TEXT');
  }
  // 5. se_work: add position column if missing
  const seWorkCols = db.prepare('PRAGMA table_info(se_work)').all() as any[];
  if (!seWorkCols.some((c: any) => c.name === 'position')) {
    db.exec('ALTER TABLE se_work ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  }
  // 6. Activities: add due_date and completed_date columns if missing
  const actColsDates = db.prepare('PRAGMA table_info(activities)').all() as any[];
  if (!actColsDates.some((c: any) => c.name === 'due_date')) {
    db.exec('ALTER TABLE activities ADD COLUMN due_date TEXT');
  }
  if (!actColsDates.some((c: any) => c.name === 'completed_date')) {
    db.exec('ALTER TABLE activities ADD COLUMN completed_date TEXT');
  }
  // 7. Activity comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // 8. Activities: unify status to ('To Do','In Progress','Completed','Blocked'), drop kanban_column
  const actColsFinal = db.prepare('PRAGMA table_info(activities)').all() as any[];
  const actSqlFinal = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='activities'").get() as any)?.sql ?? '';
  const needsUnify = actSqlFinal.includes("'Planned'") || actColsFinal.some((c: any) => c.name === 'kanban_column');
  if (needsUnify) {
    db.exec('PRAGMA foreign_keys = OFF');
    const hasKanbanF = actColsFinal.some((c: any) => c.name === 'kanban_column');
    const hasDueDateF = actColsFinal.some((c: any) => c.name === 'due_date');
    const hasCompletedF = actColsFinal.some((c: any) => c.name === 'completed_date');
    db.exec(`CREATE TABLE activities_v4 (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      opportunity_id  INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
      type            TEXT NOT NULL CHECK(type IN ('Demo','Meeting','POC','Architecture Review','Follow up Meeting','Other')),
      purpose         TEXT NOT NULL,
      date            TEXT NOT NULL,
      due_date        TEXT,
      status          TEXT NOT NULL DEFAULT 'To Do' CHECK(status IN ('To Do','In Progress','Completed','Blocked')),
      notes           TEXT,
      completed_date  TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    const statusExpr = hasKanbanF
      ? `CASE WHEN kanban_column = 'Done' THEN 'Completed' WHEN kanban_column = 'In Progress' THEN 'In Progress' WHEN status = 'In Progress' THEN 'In Progress' WHEN status = 'Completed' THEN 'Completed' WHEN status = 'Cancelled' THEN 'Blocked' ELSE 'To Do' END`
      : `CASE status WHEN 'In Progress' THEN 'In Progress' WHEN 'Completed' THEN 'Completed' WHEN 'Cancelled' THEN 'Blocked' ELSE 'To Do' END`;
    const dueDateCol = hasDueDateF ? 'due_date' : 'NULL';
    const completedCol = hasCompletedF ? 'completed_date' : 'NULL';
    db.exec(`INSERT INTO activities_v4 (id,account_id,opportunity_id,type,purpose,date,due_date,status,notes,completed_date,created_at,updated_at)
      SELECT id,account_id,opportunity_id,type,purpose,date,${dueDateCol},${statusExpr},notes,${completedCol},created_at,updated_at FROM activities`);
    db.exec('DROP TABLE activities');
    db.exec('ALTER TABLE activities_v4 RENAME TO activities');
    db.exec('PRAGMA foreign_keys = ON');
  }

  // 9. Activities: add position column if missing
  const actColsPos = db.prepare('PRAGMA table_info(activities)').all() as any[];
  if (!actColsPos.some((c: any) => c.name === 'position')) {
    db.exec('ALTER TABLE activities ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
    // Initialize positions within each status group based on date order
    const statuses = ['To Do', 'In Progress', 'Completed', 'Blocked'];
    for (const s of statuses) {
      const rows = db.prepare("SELECT id FROM activities WHERE status = ? ORDER BY date ASC, created_at ASC").all(s) as any[];
      rows.forEach((row: any, idx: number) => {
        db.prepare('UPDATE activities SET position = ? WHERE id = ?').run(idx, row.id);
      });
    }
  }

  // 10. Add msx_id columns to accounts and opportunities (for MSX import upsert)
  const accSql9 = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'").get() as any)?.sql ?? '';
  if (!accSql9.includes('msx_id')) {
    db.exec('ALTER TABLE accounts ADD COLUMN msx_id TEXT');
  }
  // 11. Add tpid column to accounts
  const accColsTpid = db.prepare('PRAGMA table_info(accounts)').all() as any[];
  if (!accColsTpid.some((c: any) => c.name === 'tpid')) {
    db.exec('ALTER TABLE accounts ADD COLUMN tpid INTEGER');
  }
  const oppSql9 = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='opportunities'").get() as any)?.sql ?? '';
  if (!oppSql9.includes('msx_id')) {
    db.exec('ALTER TABLE opportunities ADD COLUMN msx_id TEXT');
  }

  // 15. Add solution_play to opportunities
  const oppCols15 = db.prepare('PRAGMA table_info(opportunities)').all() as any[];
  if (!oppCols15.some((c: any) => c.name === 'solution_play')) {
    db.exec('ALTER TABLE opportunities ADD COLUMN solution_play TEXT');
  }

  // 12. Add msx_id to activities (for push-to-MSX sync)
  const actColsMsx = db.prepare('PRAGMA table_info(activities)').all() as any[];
  if (!actColsMsx.some((c: any) => c.name === 'msx_id')) {
    db.exec('ALTER TABLE activities ADD COLUMN msx_id TEXT');
  }
  // 13. Add msx_entity_type to activities (D365 entity type code, e.g. 'task', 'appointment')
  const actColsMsxType = db.prepare('PRAGMA table_info(activities)').all() as any[];
  if (!actColsMsxType.some((c: any) => c.name === 'msx_entity_type')) {
    db.exec("ALTER TABLE activities ADD COLUMN msx_entity_type TEXT DEFAULT 'task'");
  }

  // 14. Add msx_id to opportunity_comments (for push-to-MSX annotation sync)
  const ocCols = db.prepare('PRAGMA table_info(opportunity_comments)').all() as any[];
  if (!ocCols.some((c: any) => c.name === 'msx_id')) {
    db.exec('ALTER TABLE opportunity_comments ADD COLUMN msx_id TEXT');
  }
}

runMigrations();

export default db;
