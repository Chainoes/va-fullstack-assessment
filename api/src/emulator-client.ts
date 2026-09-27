import WebSocket from 'ws';
import { rangeFor } from './ranges';
import type { TelemetryHub } from './telemetry-hub';
import type { SensorMetadata } from './types';

/**
 * Node resolves "localhost" to IPv6 first. A second dev server can bind
 * [::]:3001 while the emulator is listening on 127.0.0.1, so always dial IPv4.
 */
export function emulatorBaseUrl(url: string): string {
  return url.replace(/\/$/, '').replace('://localhost', '://127.0.0.1');
}

function parseSensor(raw: unknown): SensorMetadata | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const sensorId = typeof record.sensorId === 'number' ? record.sensorId : Number(record.sensorId);
  if (!Number.isSafeInteger(sensorId)) return undefined;
  if (typeof record.sensorName !== 'string' || typeof record.unit !== 'string') return undefined;

  const range = rangeFor(record.sensorName);
  return {
    sensorId,
    sensorName: record.sensorName,
    unit: record.unit,
    ...(range ? { validMin: range.min, validMax: range.max } : {})
  };
}

export function startEmulatorClient(hub: TelemetryHub, emulatorUrl: string): () => void {
  const base = emulatorBaseUrl(emulatorUrl);
  const wsUrl = `${base.replace(/^http/i, 'ws')}/ws/telemetry`;
  let stopped = false;
  let generation = 0;
  let retryMs = 500;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let metadataTimer: NodeJS.Timeout | null = null;

  async function loadMetadata(): Promise<boolean> {
    try {
      const response = await fetch(`${base}/sensors`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return false;
      const body: unknown = await response.json();
      if (!Array.isArray(body)) return false;
      const sensors = body.flatMap((item) => {
        const sensor = parseSensor(item);
        return sensor ? [sensor] : [];
      });
      if (sensors.length === 0) return false;
      hub.setCatalog(sensors);
      return true;
    } catch {
      return false;
    }
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, 5_000);
  }

  function connect(): void {
    if (stopped) return;
    const current = ++generation;
    const socket = new WebSocket(wsUrl);

    socket.on('open', () => {
      if (current !== generation) return;
      retryMs = 500;
      hub.setStreamConnected(true);
      console.log(`[api] telemetry stream connected (${wsUrl})`);
    });

    socket.on('message', (data) => {
      if (current !== generation) return;
      const text = typeof data === 'string' ? data : data.toString();
      try {
        hub.ingest(JSON.parse(text) as unknown);
      } catch {
        hub.ingestInvalid('malformed_json');
      }
    });

    socket.on('close', () => {
      if (current !== generation) return;
      hub.setStreamConnected(false);
      console.warn('[api] telemetry stream disconnected; reconnecting');
      scheduleReconnect();
    });

    socket.on('error', () => {
      socket.close();
    });
  }

  async function boot(): Promise<void> {
    if (stopped) return;
    const ready = await loadMetadata();
    if (!ready) {
      console.warn(`[api] emulator metadata unavailable at ${base}/sensors; retrying`);
      setTimeout(() => {
        void boot();
      }, 2_000);
      return;
    }
    connect();
    metadataTimer = setInterval(() => {
      void loadMetadata();
    }, 60_000);
    metadataTimer.unref?.();
  }

  void boot();

  return () => {
    stopped = true;
    generation += 1;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (metadataTimer) clearInterval(metadataTimer);
    hub.setStreamConnected(false);
  };
}
