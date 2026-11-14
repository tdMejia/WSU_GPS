import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePolyline6 } from './directions.js';

test('decodes Valhalla polyline6 coordinates as longitude-latitude pairs', () => {
  assert.deepEqual(decodePolyline6('??AA'), [
    [0, 0],
    [0.000001, 0.000001],
  ]);
});

test('rejects invalid or incomplete encoded route shapes', () => {
  assert.throws(() => decodePolyline6(''), /empty route shape/);
  assert.throws(() => decodePolyline6('_'), /invalid route shape/);
  assert.throws(() => decodePolyline6('??'), /incomplete route shape/);
});
