const WINDOW_MS = 5_000;
/** Alert when the count is greater than this number, i.e. on the 4th sample. */
const THRESHOLD = 3;

/**
 * Sliding window of out-of-range event times, keyed per sensor.
 * In-range samples are not recorded. Events older than 5s fall out of the window.
 */
export class RangeMonitor {
  private hits = new Map<string, number[]>();

  record(sensorKey: string, eventMs: number): { count: number; alert: boolean } {
    const combined = [...(this.hits.get(sensorKey) ?? []), eventMs];
    const latest = Math.max(...combined);
    const windowed = combined
      .filter((timestamp) => latest - timestamp <= WINDOW_MS)
      .sort((left, right) => left - right);
    this.hits.set(sensorKey, windowed);

    const eventStillInside = latest - eventMs <= WINDOW_MS;
    return {
      count: windowed.length,
      alert: eventStillInside && windowed.length > THRESHOLD
    };
  }
}
