import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nigeriaDay, nigeriaWeek, statsRange } from '../src/analytics';
test('analytics uses Nigeria midnight rather than server/browser midnight', () => {
  assert.equal(
    nigeriaDay(new Date('2026-10-17T22:59:59Z')).toISOString(),
    '2026-10-17T00:00:00.000Z',
  );
  assert.equal(
    nigeriaDay(new Date('2026-10-17T23:00:00Z')).toISOString(),
    '2026-10-18T00:00:00.000Z',
  );
  assert.equal(
    statsRange('today', new Date('2026-10-17T23:15:00Z')).from.toISOString(),
    '2026-10-17T23:00:00.000Z',
  );
});
test('analytics weeks begin Monday WAT and rolling ranges include today', () => {
  assert.equal(
    nigeriaWeek(new Date('2026-10-18T22:59:59Z')).toISOString(),
    '2026-10-12T00:00:00.000Z',
  );
  assert.equal(
    nigeriaWeek(new Date('2026-10-18T23:00:00Z')).toISOString(),
    '2026-10-19T00:00:00.000Z',
  );
  assert.equal(
    statsRange('7d', new Date('2026-10-17T12:00:00Z')).from.toISOString(),
    '2026-10-10T23:00:00.000Z',
  );
  assert.equal(statsRange('all').from.toISOString(), '1970-01-01T00:00:00.000Z');
});
