import assert from 'node:assert/strict';
import { reciprocalRankFusion } from './rrf.js';

const fused1 = reciprocalRankFusion([
  [
    { key: 'a', source: 'memory', payload: 'A' },
    { key: 'b', source: 'memory', payload: 'B' },
  ],
  [
    { key: 'a', source: 'tasks', payload: 'A' },
    { key: 'c', source: 'tasks', payload: 'C' },
  ],
]);
assert.equal(fused1[0]!.key, 'a', 'item appearing in both lists should rank first');
assert.deepEqual(fused1[0]!.sources, ['memory', 'tasks']);
assert.ok(Math.abs(fused1[0]!.score - (1 / 61 + 1 / 61)) < 1e-9);

const fused2 = reciprocalRankFusion([
  [
    { key: 'first', source: 's', payload: null },
    { key: 'second', source: 's', payload: null },
    { key: 'third', source: 's', payload: null },
  ],
]);
assert.deepEqual(fused2.map((f) => f.key), ['first', 'second', 'third']);
assert.ok(fused2[0]!.score > fused2[1]!.score);
assert.ok(fused2[1]!.score > fused2[2]!.score);

assert.deepEqual(reciprocalRankFusion([]), []);
assert.deepEqual(reciprocalRankFusion([[], []]), []);

const small = reciprocalRankFusion([[{ key: 'x', source: 's', payload: null }]], 10);
const large = reciprocalRankFusion([[{ key: 'x', source: 's', payload: null }]], 1000);
assert.ok(small[0]!.score > large[0]!.score, 'smaller k should produce larger score');

console.log('rrf.test.ts: all assertions passed');
