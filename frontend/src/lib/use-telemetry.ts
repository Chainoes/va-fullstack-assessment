'use client';

import { useEffect, useState } from 'react';
import {
  API_BASE_URL,
  fetchHealth,
  fetchLatestTelemetry,
  fetchSensors,
  type SensorMetadata,
  type TelemetryReading
} from './api-client';

const HISTORY_LIMIT = 40;

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';
export type HealthStatus = 'ok' | 'unhealthy' | 'checking';

export interface TelemetryState {
  healthStatus: HealthStatus;
  healthError: string | null;
  sensors: SensorMetadata[];
  readings: Record<number, TelemetryReading>;
  history: Record<number, number[]>;
  streamStatus: StreamStatus;
  loadError: string | null;
  now: number;
}

function appendHistory(current: Record<number, number[]>, reading: TelemetryReading): Record<number, number[]> {
  const existing = current[reading.sensorId] ?? [];
  return {
    ...current,
    [reading.sensorId]: [...existing, reading.value].slice(-HISTORY_LIMIT)
  };
}

export function useTelemetry(): TelemetryState {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const [healthError, setHealthError] = useState<string | null>(null);
  const [sensors, setSensors] = useState<SensorMetadata[]>([]);
  const [readings, setReadings] = useState<Record<number, TelemetryReading>>({});
  const [history, setHistory] = useState<Record<number, number[]>>({});
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        await fetchHealth();
        if (cancelled) return;
        setHealthStatus('ok');
        setHealthError(null);
      } catch (error: unknown) {
        if (cancelled) return;
        setHealthStatus('unhealthy');
        setHealthError(error instanceof Error ? error.message : 'Failed to reach API');
      }
    }

    void (async () => {
      while (!cancelled) {
        await checkHealth();
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const source = new EventSource(`${API_BASE_URL}/telemetry/stream`);

    function applySnapshot(list: TelemetryReading[]) {
      setReadings((previous) => {
        const next = { ...previous };
        for (const reading of list) {
          const current = next[reading.sensorId];
          if (!current || reading.timestamp >= current.timestamp) {
            next[reading.sensorId] = reading;
          }
        }
        return next;
      });
      setHistory((previous) => {
        const next = { ...previous };
        for (const reading of list) {
          if (!next[reading.sensorId] || next[reading.sensorId].length === 0) {
            next[reading.sensorId] = [reading.value];
          }
        }
        return next;
      });
    }

    async function load() {
      try {
        const [sensorList, latest] = await Promise.all([fetchSensors(), fetchLatestTelemetry()]);
        if (cancelled) return;
        setSensors(sensorList);
        applySnapshot(latest.readings);
        setLoadError(null);
      } catch (error: unknown) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load telemetry');
      }
    }

    void load();
    const refresh = setInterval(() => {
      void load();
    }, 30_000);

    source.addEventListener('reading', (event) => {
      const message = event as MessageEvent<string>;
      try {
        const reading = JSON.parse(message.data) as TelemetryReading;
        setReadings((previous) => ({ ...previous, [reading.sensorId]: reading }));
        setHistory((previous) => appendHistory(previous, reading));
        setStreamStatus('live');
      } catch {
        // Keep the last good sample if a single event is malformed.
      }
    });

    source.onopen = () => setStreamStatus('live');
    source.onerror = () => {
      setStreamStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'reconnecting');
    };

    const poll = setInterval(() => {
      void fetchLatestTelemetry()
        .then((latest) => {
          if (!cancelled) applySnapshot(latest.readings);
        })
        .catch(() => {
          if (!cancelled && source.readyState === EventSource.CLOSED) {
            setStreamStatus('offline');
          }
        });
    }, 5000);

    return () => {
      cancelled = true;
      source.close();
      clearInterval(poll);
      clearInterval(refresh);
    };
  }, []);

  return {
    healthStatus,
    healthError,
    sensors,
    readings,
    history,
    streamStatus,
    loadError,
    now
  };
}
