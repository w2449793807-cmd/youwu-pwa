import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateItemMetrics,
  monthKey,
  calculateMonthSummary,
  mergeById,
  mergeState,
  normalizeState,
  createBackup,
  parseBackup,
} from '../src/core.js';

test('calculateItemMetrics computes inclusive ownership days and daily/per-use cost', () => {
  const metrics = calculateItemMetrics({
    price: 8000,
    extraCost: 500,
    salePrice: 1000,
    purchaseDate: '2026-01-01',
    status: 'sold',
    endDate: '2026-01-10',
    uses: 10,
  });
  assert.equal(metrics.days, 10);
  assert.equal(metrics.totalCost, 7500);
  assert.equal(metrics.dailyCost, 750);
  assert.equal(metrics.perUseCost, 750);
});

test('calculateItemMetrics keeps a one-day minimum', () => {
  const metrics = calculateItemMetrics({
    price: 99,
    purchaseDate: '2026-11-09',
    status: 'active',
  }, new Date('2026-11-09T12:00:00+08:00'));
  assert.equal(metrics.days, 1);
  assert.equal(metrics.dailyCost, 99);
  assert.equal(metrics.perUseCost, null);
});

test('monthKey and calculateMonthSummary separate income and expense', () => {
  const transactions = [
    { type: 'expense', amount: 20, categoryId: 'food', date: '2026-11-01' },
    { type: 'expense', amount: 30, categoryId: 'food', date: '2026-11-02' },
    { type: 'income', amount: 100, categoryId: 'salary', date: '2026-11-03' },
    { type: 'expense', amount: 9, categoryId: 'transport', date: '2026-10-01' },
  ];
  assert.equal(monthKey('2026-11-09'), '2026-11');
  const summary = calculateMonthSummary(transactions, '2026-11');
  assert.equal(summary.expense, 50);
  assert.equal(summary.income, 100);
  assert.equal(summary.balance, 50);
  assert.deepEqual(summary.byCategory, [
    { categoryId: 'food', type: 'expense', amount: 50 },
  ]);
});

test('mergeById takes the newest record and preserves deletion tombstones', () => {
  const merged = mergeById(
    [{ id: 'a', value: 'local-old', updatedAt: 1 }, { id: 'b', value: 'local-new', updatedAt: 4 }],
    [{ id: 'a', value: 'remote-new', updatedAt: 3 }, { id: 'b', value: 'remote-old', updatedAt: 2 }, { id: 'c', deletedAt: '2026-11-09', updatedAt: 2 }],
  );
  assert.deepEqual(merged.map((x) => x.id).sort(), ['a', 'b', 'c']);
  assert.equal(merged.find((x) => x.id === 'a').value, 'remote-new');
  assert.equal(merged.find((x) => x.id === 'b').value, 'local-new');
  assert.ok(merged.find((x) => x.id === 'c').deletedAt);
});

test('mergeState merges independent modules and newest settings', () => {
  const local = normalizeState({
    items: [{ id: 'i1', name: 'local', updatedAt: 2 }],
    transactions: [{ id: 't1', amount: 10, updatedAt: 2 }],
    settings: { theme: 'light', settingsUpdatedAt: 2 },
  });
  const remote = normalizeState({
    items: [{ id: 'i1', name: 'remote', updatedAt: 1 }, { id: 'i2', name: 'remote-2', updatedAt: 3 }],
    transactions: [{ id: 't1', amount: 10, updatedAt: 1 }, { id: 't2', amount: 20, updatedAt: 3 }],
    settings: { theme: 'dark', settingsUpdatedAt: 4 },
  });
  const merged = mergeState(local, remote);
  assert.equal(merged.items.find((x) => x.id === 'i1').name, 'local');
  assert.equal(merged.items.length, 2);
  assert.equal(merged.transactions.length, 2);
  assert.equal(merged.settings.theme, 'dark');
});

test('backup roundtrip preserves state and rejects unrelated files', () => {
  const state = normalizeState({ items: [{ id: 'i1', name: '相机', price: 1000 }] });
  const backup = createBackup(state, new Date('2026-11-09T00:00:00Z'));
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.items[0].name, '相机');
  assert.throws(() => parseBackup('{"hello":true}'), /备份/);
});
