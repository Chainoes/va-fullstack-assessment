/**
 * Client for the Vehicle Analytics API.
 * Metadata: GET /sensors. Latest values: GET /telemetry/latest.
 * Live updates: EventSource on GET /telemetry/stream.
 */

export interface SensorMetadata {
  sensorId: number;
  sensorName: string;
  unit: string;
  validMin?: number;
  validMax?: number;
}

export interface TelemetryReading {
  sensorId: number;
  value: number;
  timestamp: number;
  inRange: boolean;
}

export interface HealthResponse {
  status: string;
  emulator?: boolean;
  stream?: 'connected' | 'disconnected';
  reason?: string;
}

export interface LatestTelemetryResponse {
  streamConnected: boolean;
  readings: TelemetryReading[];
}

export interface SensorListResponse {
  sensors: SensorMetadata[];
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

async function fetchJson<T>(path: string, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      mode: 'cors',
      signal: controller.signal
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
    if (!response.ok) {
      throw new Error(data.error ?? data.reason ?? `${response.status} ${response.statusText}`);
    }
    return data as T;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchHealth(timeoutMs = 3000): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/health', timeoutMs);
}

export async function fetchSensors(): Promise<SensorMetadata[]> {
  const body = await fetchJson<SensorListResponse>('/sensors');
  return body.sensors;
}

export function fetchLatestTelemetry(): Promise<LatestTelemetryResponse> {
  return fetchJson<LatestTelemetryResponse>('/telemetry/latest');
}
