import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReading } from './validate';

const SENSOR_ID = 1000000070501;

test('accepts a well-formed reading and ignores extra fields', () => {
  const result = validateReading({
    sensorId: SENSOR_ID,
    value: 42.5,
    timestamp: 1_700_000_000,
    unexpected: 'ignore-me'
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recovered, false);
  assert.deepEqual(result.reading, {
    sensorId: SENSOR_ID,
    value: 42.5,
    timestamp: 1_700_000_000
  });
});

test('recovers sensorId and value when they arrive as numeric strings', () => {
  const result = validateReading({
    sensorId: String(SENSOR_ID),
    value: '61.250',
    timestamp: 1_700_000_000
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recovered, true);
  assert.equal(result.reading.sensorId, SENSOR_ID);
  assert.equal(result.reading.value, 61.25);
});

test('drops a non-numeric value', () => {
  const result = validateReading({
    sensorId: SENSOR_ID,
    value: '12X34',
    timestamp: 1_700_000_000
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid_value' });
});

test('drops a payload with no sensorId', () => {
  const result = validateReading({ value: 10, timestamp: 1_700_000_000 });
  assert.deepEqual(result, { ok: false, reason: 'missing_sensor_id' });
});

test('drops non-objects', () => {
  assert.equal(validateReading(null).ok, false);
  assert.equal(validateReading(['nope']).ok, false);
  assert.equal(validateReading('nope').ok, false);
});
