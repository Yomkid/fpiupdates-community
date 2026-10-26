import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHashtag, parseEntities } from '../src/text-entities';
test('entity parser skips links/emails and preserves UTF-16 offsets after emoji', () => {
  const text =
    '😀 Hi @Mayomi #Ilaro #Ìlárò mail@example.test foo+#hidden@example.test https://example.test/@fake#wrong www.test.com/#no';
  const entities = parseEntities(text);
  assert.deepEqual(
    entities.map((e) => e.label),
    ['@Mayomi', '#Ilaro', '#Ìlárò'],
  );
  for (const e of entities) assert.equal(text.slice(e.start, e.end), e.label);
  assert.equal(entities[0].username, 'mayomi');
  assert.equal(entities[1].hashtag, 'ilaro');
});
test('hashtag canonicalization supports Unicode and rejects invalid/oversized tags', () => {
  assert.equal(normalizeHashtag('ＩＬＡＲＯ'), 'ilaro');
  assert.equal(normalizeHashtag('ÌLÁRÒ'), 'ìlárò');
  assert.throws(() => normalizeHashtag('two words'));
  assert.throws(() => normalizeHashtag('a'.repeat(65)));
  assert.equal(parseEntities('#' + 'a'.repeat(65)).length, 0);
  assert.equal(parseEntities('@' + 'a'.repeat(31)).length, 0);
});
test('entity parser prevents partial email/word matches and caps mass mentions', () => {
  assert.equal(parseEntities('abc@person foo#tag @@person ##tag').length, 0);
  assert.equal(parseEntities('(@person), #2026!').length, 2);
  assert.throws(() => parseEntities(Array.from({ length: 11 }, (_, i) => '@user' + i).join(' ')));
  assert.throws(() => parseEntities(Array.from({ length: 11 }, (_, i) => '#tag' + i).join(' ')));
  assert.throws(() => parseEntities(Array(31).fill('#same').join(' ')));
});
