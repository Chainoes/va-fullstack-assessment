import assert from 'node:assert/strict';
import test from 'node:test';
import { TelemetryHub } from './telemetry-hub';
import type { SensorMetadata } from './types';

const BATTERY: SensorMetadata = {
  sensorId: 1000000070501,
  sensorName: 'BATTERY_TEMPERATURE',
  unit: 'C',
  validMin: 20,
  validMax: 80
};

const MOTOR: SensorMetadata = {
  sensorId: 1000000070502,
  sensorName: 'MOTOR_TEMPERATURE',
  unit: 'C',
  validMin: 30,
  validMax: 120
};

function createHub(): { hub: TelemetryHub; logs: string[] } {
  const logs: string[] = [];
  const hub = new TelemetryHub((message) => logs.push(message));
  hub.setCatalog([BATTERY, MOTOR]);
  return { hub, logs };
}

test('stores a recovered reading and publishes it', () => {
  const { hub } = createHub();
  const seen: number[] = [];
  hub.subscribe((reading) => seen.push(reading.value));

  hub.ingest({
    sensorId: String(BATTERY.sensorId),
    value: '45.500',
    timestamp: 1_700_000_000,
    extra: true
  });

  const latest = hub.getLatestById(BATTERY.sensorId);
  assert.ok(latest);
  assert.equal(latest.value, 45.5);
  assert.equal(latest.inRange, true);
  assert.deepEqual(seen, [45.5]);
  assert.equal(hub.quality().recovered, 1);
  assert.equal(hub.quality().dropped, 0);
});

test('does not store or publish invalid readings', () => {
  const { hub } = createHub();
  let published = 0;
  hub.subscribe(() => {
    published += 1;
  });

  hub.ingest({ sensorId: BATTERY.sensorId, value: 'NaNish12', timestamp: 1_700_000_000 });
  hub.ingest({ value: 40, timestamp: 1_700_000_000 });
  hub.ingestInvalid('malformed_json');

  assert.equal(hub.getLatest().length, 0);
  assert.equal(published, 0);
  assert.equal(hub.quality().dropped, 3);
  assert.equal(hub.quality().dropReasons.invalid_value, 1);
  assert.equal(hub.quality().dropReasons.missing_sensor_id, 1);
  assert.equal(hub.quality().dropReasons.malformed_json, 1);
});

test('keeps out-of-range values and logs once the 5 second threshold is crossed', () => {
  const { hub, logs } = createHub();
  const start = 1_700_000_000;

  hub.ingest({ sensorId: BATTERY.sensorId, value: 90, timestamp: start });
  hub.ingest({ sensorId: BATTERY.sensorId, value: 91, timestamp: start + 1 });
  hub.ingest({ sensorId: BATTERY.sensorId, value: 50, timestamp: start + 2 });
  hub.ingest({ sensorId: BATTERY.sensorId, value: 92, timestamp: start + 3 });
  assert.equal(logs.length, 0);

  hub.ingest({ sensorId: BATTERY.sensorId, value: 93, timestamp: start + 4 });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[[0-9]{4}-[0-9]{2}-[0-9]{2}T/);
  assert.match(logs[0], /BATTERY_TEMPERATURE/);
  assert.match(logs[0], new RegExp(String(BATTERY.sensorId)));
  assert.match(logs[0], /4 times in 5s/);

  const latest = hub.getLatestById(BATTERY.sensorId);
  assert.equal(latest?.value, 93);
  assert.equal(latest?.inRange, false);
});

test('does not let one sensor trip the alert for another', () => {
  const { hub, logs } = createHub();
  const start = 1_700_000_000;

  for (let index = 0; index < 4; index += 1) {
    hub.ingest({ sensorId: BATTERY.sensorId, value: 100, timestamp: start + index });
  }
  hub.ingest({ sensorId: MOTOR.sensorId, value: 200, timestamp: start });

  assert.equal(logs.length, 1);
  assert.match(logs[0], /BATTERY_TEMPERATURE/);
  assert.equal(hub.getLatestById(MOTOR.sensorId)?.inRange, false);
});

test('an out-of-range burst older than 5 seconds does not keep the alert latched', () => {
  const { hub, logs } = createHub();
  const start = 1_700_000_000;

  for (let index = 0; index < 4; index += 1) {
    hub.ingest({ sensorId: BATTERY.sensorId, value: 100, timestamp: start + index });
  }
  assert.equal(logs.length, 1);

  hub.ingest({ sensorId: BATTERY.sensorId, value: 100, timestamp: start + 20 });
  assert.equal(logs.length, 1);
  assert.equal(hub.quality().outOfRange, 5);
});
