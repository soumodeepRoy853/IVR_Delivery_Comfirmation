import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { basicAuth } from './auth';
import { config } from './config';
import { query } from './db';
import { HttpError } from './http';
import { deliveriesRouter } from './routes/deliveries';
import { recordingsRouter } from './routes/recordings';
import { twilioWebhooksRouter } from './webhooks/twilio';

const app = express();

app.use(cors({ origin: config.webOrigin || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1 AS ok');
    res.json({ ok: true, provider: config.telephonyProvider });
  } catch {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

// Webhooks stay public; Twilio authenticates them with X-Twilio-Signature.
app.use('/webhooks/twilio', twilioWebhooksRouter);

// Everything under /api except health requires dashboard credentials.
app.use('/api', (req, res, next) => {
  if (req.originalUrl === '/api/health') {
    next();
    return;
  }
  basicAuth(req, res, next);
});
app.use('/api/deliveries', deliveriesRouter);
app.use('/api/recordings', recordingsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    if (error.headers) res.set(error.headers);
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error('Unhandled API error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`IVR API listening on port ${config.port} (provider: ${config.telephonyProvider})`);
});
