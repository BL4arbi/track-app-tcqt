import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import authRoutes from './routes/auth.js';
import clientsRoutes from './routes/clients.js';
import tasksRoutes from './routes/tasks.js';
import documentsRoutes from './routes/documents.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(process.env.UPLOAD_DIR || './uploads'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api', documentsRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default app;
