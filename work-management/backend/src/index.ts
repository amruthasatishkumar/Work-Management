// In production, DB_PATH and PORT are injected by Electron's main.js before this
// module is loaded. In development, load from a .env file if present.
if (!process.env.DB_PATH) {
  try { require('dotenv').config(); } catch { /* no .env in production */ }
}
import express from 'express';
import cors from 'cors';
import path from 'path';
import './db/database'; // Initialize DB and run schema

import territoriesRouter       from './routes/territories';
import accountsRouter          from './routes/accounts';
import opportunitiesRouter     from './routes/opportunities';
import opportunityCommentsRouter    from './routes/opportunityComments';
import opportunityNextStepsRouter   from './routes/opportunityNextSteps';
import activitiesRouter        from './routes/activities';
import tasksRouter             from './routes/tasks';
import dashboardRouter         from './routes/dashboard';
import seWorkRouter            from './routes/seWork';
import chatRouter              from './routes/chat';
import msxRouter               from './routes/msx';
import milestonesRouter        from './routes/milestones';

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// In dev: Vite runs on :5173. In production (Electron): frontend is served
// as static files from this same Express server on :3001.
app.use(cors({
  origin: isProd ? 'http://localhost:3001' : 'http://localhost:5173',
}));
app.use(express.json({ limit: '50mb' }));

// Lightweight health check — used by Electron startup poll instead of /api/dashboard
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/dashboard',                            dashboardRouter);
app.use('/api/territories',                          territoriesRouter);
app.use('/api/accounts',                             accountsRouter);
app.use('/api/opportunities',                        opportunitiesRouter);
app.use('/api/opportunities/:id/comments',           opportunityCommentsRouter);
app.use('/api/opportunities/:id/next-steps',         opportunityNextStepsRouter);
app.use('/api/activities',                           activitiesRouter);
app.use('/api/tasks',                                tasksRouter);
app.use('/api/se-work',                              seWorkRouter);
app.use('/api/chat',                                 chatRouter);
app.use('/api/msx',                                  msxRouter);
app.use('/api/milestones',                           milestonesRouter);

// Serve compiled frontend in production (Electron bundles the built frontend)
if (isProd) {
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  // SPA fallback — all non-API routes return index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`Work Management API running on http://localhost:${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    // Port already in use — likely a previous instance's backend is still running.
    // Don't crash; Electron's main.js will poll until the existing server responds.
    console.warn(`[backend] Port ${PORT} already in use — will connect to existing server`);
  } else {
    // Rethrow unexpected errors
    throw err;
  }
});

export default app;
