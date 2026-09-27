import assert from 'node:assert/strict';
import test from 'node:test';
import { RangeMonitor } from './range-monitor';

test('alerts only after more than 3 out-of-range samples inside 5 seconds', () => {
  const monitor = new RangeMonitor();
  const start = 1_700_000_000_000;

  assert.equal(monitor.record('battery', start).alert, false);
  assert.equal(monitor.record('battery', start + 1_000).alert, false);
  assert.equal(monitor.record('battery', start + 2_000).alert, false);

  const fourth = monitor.record('battery', start + 3_000);
  assert.equal(fourth.alert, true);
  assert.equal(fourth.count, 4);
});

test('drops samples that fall outside the trailing 5 second window', () => {
  const monitor = new RangeMonitor();
  const start = 1_700_000_000_000;

  monitor.record('battery', start);
  monitor.record('battery', start + 1_000);
  monitor.record('battery', start + 2_000);
  monitor.record('battery', start + 3_000);

  const later = monitor.record('battery', start + 3_000 + 6_000);
  assert.equal(later.count, 1);
  assert.equal(later.alert, false);
});

test('keeps an event that is exactly 5 seconds old', () => {
  const monitor = new RangeMonitor();
  const start = 1_700_000_000_000;
  monitor.record('battery', start);
  const edge = monitor.record('battery', start + 5_000);
  assert.equal(edge.count, 2);
  assert.equal(edge.alert, false);
});

test('counts each sensor independently', () => {
  const monitor = new RangeMonitor();
  const start = 1_700_000_000_000;
  monitor.record('a', start);
  monitor.record('a', start + 100);
  monitor.record('a', start + 200);
  const other = monitor.record('b', start + 300);
  assert.equal(other.count, 1);
  assert.equal(other.alert, false);
});
