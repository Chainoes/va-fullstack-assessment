import fs from 'fs';
import http from 'http';
import path from 'path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import { startEmulatorClient } from './emulator-client';
import { TelemetryHub } from './telemetry-hub';
import type { Reading } from './types';

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json());

const EMULATOR_URL = process.env.EMULATOR_URL || 'http://localhost:3001';
const hub = new TelemetryHub();

function sendError(res: Response, status: number, code: string, error: string): void {
  res.status(status).json({ error, code });
}

function loadOpenApiSpec(): object {
  const specPath = path.join(__dirname, '..', 'openapi.yaml');
  const parsed = yaml.load(fs.readFileSync(specPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`OpenAPI spec at ${specPath} is empty`);
  }
  return parsed;
}

const openApiSpec = loadOpenApiSpec();

app.get('/health', async (_req, res) => {
  const stream = hub.isStreamConnected() ? 'connected' : 'disconnected';
  try {
    const response = await fetch(`${EMULATOR_URL.replace(/\/$/, '')}/sensors`, {
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      return res.json({ status: 'ok', emulator: true, stream });
    }
  } catch {
    // Emulator HTTP is unreachable.
  }
  res.status(503).json({ status: 'unhealthy', emulator: false, stream });
});

app.get('/sensors', (_req, res) => {
  if (!hub.hasCatalog()) {
    return sendError(res, 503, 'EMULATOR_UNAVAILABLE', 'Sensor metadata is not available yet');
  }
  res.json({ sensors: hub.getCatalog() });
});

app.get('/telemetry/latest', (_req, res) => {
  res.json({
    streamConnected: hub.isStreamConnected(),
    readings: hub.getLatest()
  });
});

app.get('/telemetry/latest/:sensorId', (req, res) => {
  if (!/^\d+$/.test(req.params.sensorId)) {
    return sendError(res, 400, 'INVALID_SENSOR_ID', 'sensorId must be a positive integer');
  }
  const sensorId = Number(req.params.sensorId);
  if (!Number.isSafeInteger(sensorId) || !hub.knowsSensor(sensorId)) {
    return sendError(res, 404, 'NOT_FOUND', 'Unknown sensor');
  }
  const reading = hub.getLatestById(sensorId);
  if (!reading) {
    return sendError(res, 404, 'NO_READING', 'No telemetry received for this sensor yet');
  }
  res.json(reading);
});

app.get('/telemetry/quality', (_req, res) => {
  res.json(hub.quality());
});

app.get('/telemetry/stream', (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const send = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = hub.subscribe((reading: Reading) => {
    send('reading', reading);
  });

  for (const reading of hub.getLatest()) {
    send('reading', reading);
  }

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 15_000);
  heartbeat.unref?.();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on('close', close);
  res.on('error', close);
});

app.get('/openapi.yaml', (_req, res) => {
  res.type('yaml').send(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Vehicle Analytics API' }));

app.use((_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Not found');
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error', error);
  if (res.headersSent) return;
  sendError(res, 500, 'INTERNAL', 'Internal server error');
});

const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(Number(PORT), HOST, () => {
  console.log(`API server listening on http://${HOST}:${PORT}`);
  console.log(`OpenAPI docs at http://${HOST}:${PORT}/docs`);
  hub.startQualityReports();
  startEmulatorClient(hub, EMULATOR_URL);
});
