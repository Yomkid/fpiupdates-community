import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidates } from '../src/feed-ranking';
const now = Date.now(),
  context = {
    now,
    following: new Set(['followed']),
    topics: new Set(['topic']),
    communities: new Set(['joined']),
  };
function entry(id: string, authorId = id, age = 0, likes = 0) {
  return {
    id,
    postId: id,
    actorId: authorId,
    createdAt: new Date(now - age * 3600000),
    post: {
      authorId,
      communityId: null as string | null,
      topicId: null as string | null,
      _count: { likes, reposts: 0, replies: 0 },
    },
  };
}
test('ranking mixes outside posts, bounded popularity and relevant authors without requiring membership', () => {
  const outside = entry('outside'),
    followed = entry('followed_post', 'followed'),
    old = entry('old', 'old', 24 * 30, 100000);
  const ranked = rankCandidates([old, outside, followed], context);
  assert.deepEqual(ranked, ['followed_post', 'outside', 'old']);
});
test('ranking de-duplicates reposts and gives consecutive authors breathing room', () => {
  const all = Array.from({ length: 8 }, (_, i) => entry('same' + i, 'same'));
  const other = entry('other');
  const duplicate = { ...other, id: 'repost' };
  const ranked = rankCandidates([...all, other, duplicate], context);
  assert.equal(ranked.length, 9);
  assert.ok(ranked.includes('other') !== ranked.includes('repost'));
  assert.ok(ranked.indexOf('other') < 4 || ranked.indexOf('repost') < 4);
});
