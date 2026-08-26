import test from 'node:test';
import assert from 'node:assert/strict';
import { isInRanges, sampleWingWave } from './wingMotion.js';

const event = [{ at: 1000, duration: 600, amplitude: 12 }];

test('base begins flexing before the wing tip', () => {
  assert.notEqual(sampleWingWave(1040, event, 0), 0);
  assert.equal(sampleWingWave(1040, event, 4), 0);
});

test('tip joins later after its segment lag', () => {
  assert.notEqual(sampleWingWave(1180, event, 4), 0);
});

test('wave returns to neutral after the event and lag have finished', () => {
  assert.equal(sampleWingWave(1900, event, 0), 0);
  assert.equal(sampleWingWave(1900, event, 4), 0);
});

test('airborne range detection uses start-inclusive/end-exclusive bounds', () => {
  const ranges = [[4000, 10000], [16000, 22000]];
  assert.equal(isInRanges(4000, ranges), true);
  assert.equal(isInRanges(9999, ranges), true);
  assert.equal(isInRanges(10000, ranges), false);
  assert.equal(isInRanges(17000, ranges), true);
});