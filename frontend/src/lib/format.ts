const ACRONYMS = new Set(['SOC', 'FL', 'FR', 'RL', 'RR']);

export function formatSensorName(sensorName: string): string {
  return sensorName
    .split('_')
    .map((part) => (ACRONYMS.has(part) ? part : part.charAt(0) + part.slice(1).toLowerCase()))
    .join(' ');
}

export function formatUnit(unit: string): string {
  if (unit === 'C') return '°C';
  return unit;
}

export function formatValue(value: number, unit: string): string {
  if (unit === 'kPa') return value.toFixed(0);
  return value.toFixed(1);
}

export function formatAge(timestampSeconds: number, nowMs: number): string {
  const ageSeconds = Math.max(0, nowMs / 1000 - timestampSeconds);
  if (ageSeconds < 1) return 'just now';
  if (ageSeconds < 60) return `${Math.floor(ageSeconds)}s ago`;
  return `${Math.floor(ageSeconds / 60)}m ago`;
}

export function isStale(timestampSeconds: number, nowMs: number): boolean {
  return nowMs / 1000 - timestampSeconds > 4;
}

export function formatRange(min: number, max: number, unit: string): string {
  return `${min}–${max} ${formatUnit(unit)}`;
}
