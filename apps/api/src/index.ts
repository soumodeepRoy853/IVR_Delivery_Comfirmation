import cors from 'cors';
import express from 'express';
import { config } from './config';
import { query } from './db';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1 AS ok');
    res.json({ ok: true, provider: config.telephonyProvider });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

app.listen(config.port, () => {
  console.log(`IVR API listening on port ${config.port} (provider: ${config.telephonyProvider})`);
});
