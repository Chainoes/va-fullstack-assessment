import { isWithinRange, rangeFor } from './ranges';
import { RangeMonitor } from './range-monitor';
import type { QualityStats, Reading, SensorMetadata } from './types';
import { validateReading } from './validate';

export type Logger = (message: string) => void;

function eventTimeMs(timestamp: number): number {
  // Emulator timestamps are unix seconds. Treat an already-millisecond value as-is.
  return timestamp > 1e12 ? timestamp : timestamp * 1000;
}

export class TelemetryHub {
  private catalog = new Map<number, SensorMetadata>();
  private order: number[] = [];
  private latest = new Map<number, Reading>();
  private listeners = new Set<(reading: Reading) => void>();
  private monitor = new RangeMonitor();
  private streamConnected = false;
  private received = 0;
  private accepted = 0;
  private recovered = 0;
  private dropped = 0;
  private outOfRange = 0;
  private dropReasons: Record<string, number> = {};
  private droppedSinceReport = 0;
  private reportTimer: NodeJS.Timeout | null = null;

  constructor(private readonly logError: Logger = (message) => console.error(message)) {}

  setCatalog(sensors: SensorMetadata[]): void {
    if (sensors.length === 0) return;
    this.order = sensors.map((sensor) => sensor.sensorId);
    this.catalog = new Map(sensors.map((sensor) => [sensor.sensorId, sensor]));
  }

  getCatalog(): SensorMetadata[] {
    return this.order.flatMap((id) => {
      const sensor = this.catalog.get(id);
      return sensor ? [sensor] : [];
    });
  }

  hasCatalog(): boolean {
    return this.catalog.size > 0;
  }

  setStreamConnected(connected: boolean): void {
    this.streamConnected = connected;
  }

  isStreamConnected(): boolean {
    return this.streamConnected;
  }

  subscribe(listener: (reading: Reading) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getLatest(): Reading[] {
    return this.order.flatMap((id) => {
      const reading = this.latest.get(id);
      return reading ? [reading] : [];
    });
  }

  getLatestById(sensorId: number): Reading | undefined {
    return this.latest.get(sensorId);
  }

  knowsSensor(sensorId: number): boolean {
    return this.catalog.has(sensorId);
  }

  ingest(payload: unknown): void {
    this.received += 1;
    const result = validateReading(payload);
    if (!result.ok) {
      this.noteDrop(result.reason);
      return;
    }

    const sensor = this.catalog.get(result.reading.sensorId);
    if (!sensor) {
      this.noteDrop('unknown_sensor');
      return;
    }

    if (result.recovered) this.recovered += 1;

    const range = rangeFor(sensor.sensorName);
    const inRange = isWithinRange(sensor.sensorName, result.reading.value);
    const reading: Reading = {
      sensorId: result.reading.sensorId,
      value: result.reading.value,
      timestamp: result.reading.timestamp,
      inRange
    };

    this.accepted += 1;
    this.latest.set(reading.sensorId, reading);

    if (!inRange && range) {
      this.outOfRange += 1;
      const window = this.monitor.record(String(reading.sensorId), eventTimeMs(reading.timestamp));
      if (window.alert) {
        const stamp = new Date().toISOString();
        this.logError(
          `[${stamp}] ERROR ${sensor.sensorName} (sensorId ${sensor.sensorId}) out of range ${window.count} times in 5s. Value ${reading.value.toFixed(3)} ${sensor.unit} is outside ${range.min}–${range.max}.`
        );
      }
    }

    for (const listener of this.listeners) {
      listener(reading);
    }
  }

  /** Count a frame that was not even valid JSON. */
  ingestInvalid(reason: string): void {
    this.received += 1;
    this.noteDrop(reason);
  }

  startQualityReports(intervalMs = 10_000): void {
    if (this.reportTimer) return;
    this.reportTimer = setInterval(() => this.flushQualityReport(), intervalMs);
    this.reportTimer.unref?.();
  }

  stop(): void {
    if (this.reportTimer) clearInterval(this.reportTimer);
    this.reportTimer = null;
  }

  quality(): QualityStats {
    return {
      received: this.received,
      accepted: this.accepted,
      recovered: this.recovered,
      dropped: this.dropped,
      outOfRange: this.outOfRange,
      dropReasons: { ...this.dropReasons },
      streamConnected: this.streamConnected
    };
  }

  private flushQualityReport(): void {
    if (this.droppedSinceReport === 0) return;
    const reasons = Object.entries(this.dropReasons)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(', ');
    console.warn(
      `[api] dropped ${this.droppedSinceReport} invalid reading(s) since last report ` +
        `(cumulative dropped=${this.dropped}, recovered=${this.recovered}; ${reasons})`
    );
    this.droppedSinceReport = 0;
  }

  private noteDrop(reason: string): void {
    this.dropped += 1;
    this.droppedSinceReport += 1;
    this.dropReasons[reason] = (this.dropReasons[reason] ?? 0) + 1;
  }
}
