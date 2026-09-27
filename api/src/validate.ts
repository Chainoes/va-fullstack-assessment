export interface ParsedReading {
  sensorId: number;
  value: number;
  timestamp: number;
}

export type ValidationResult =
  | { ok: true; reading: ParsedReading; recovered: boolean }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSensorId(value: unknown): { ok: true; value: number; coerced: boolean } | { ok: false } {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return { ok: true, value, coerced: false };
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) {
      return { ok: true, value: parsed, coerced: true };
    }
  }
  return { ok: false };
}

function parseFiniteNumber(value: unknown): { ok: true; value: number; coerced: boolean } | { ok: false } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { ok: true, value, coerced: false };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return { ok: true, value: parsed, coerced: true };
      }
    }
  }
  return { ok: false };
}

/**
 * Accept a telemetry payload or explain why it cannot be used.
 * Numeric strings are coerced (the emulator emits these on purpose).
 * Extra fields are ignored. Anything that cannot be turned into a finite
 * sensorId, value, and timestamp is rejected.
 */
export function validateReading(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return { ok: false, reason: 'not_an_object' };
  }

  if (payload.sensorId === undefined || payload.sensorId === null) {
    return { ok: false, reason: 'missing_sensor_id' };
  }
  const sensorId = parseSensorId(payload.sensorId);
  if (!sensorId.ok) {
    return { ok: false, reason: 'invalid_sensor_id' };
  }

  if (payload.value === undefined || payload.value === null) {
    return { ok: false, reason: 'missing_value' };
  }
  const value = parseFiniteNumber(payload.value);
  if (!value.ok) {
    return { ok: false, reason: 'invalid_value' };
  }

  if (payload.timestamp === undefined || payload.timestamp === null) {
    return { ok: false, reason: 'missing_timestamp' };
  }
  const timestamp = parseFiniteNumber(payload.timestamp);
  if (!timestamp.ok) {
    return { ok: false, reason: 'invalid_timestamp' };
  }

  return {
    ok: true,
    recovered: sensorId.coerced || value.coerced || timestamp.coerced,
    reading: {
      sensorId: sensorId.value,
      value: value.value,
      timestamp: timestamp.value
    }
  };
}
