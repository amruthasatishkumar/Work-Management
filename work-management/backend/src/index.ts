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

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// In dev: Vite runs on :5173. In production (Electron): frontend is served
// as static files from this same Express server on :3001.
app.use(cors({
  origin: isProd ? 'http://localhost:3001' : 'http://localhost:5173',
}));
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Work Management API running on http://localhost:${PORT}`);
});

export default app;
