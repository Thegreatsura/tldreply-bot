import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { containsSpoiler, markSpoilers } from './spoilers';

const spoiler = (offset: number, length: number) => ({ type: 'spoiler', offset, length });

describe('markSpoilers', () => {
  test('leaves text without entities untouched', () => {
    assert.equal(markSpoilers('nothing hidden', undefined), 'nothing hidden');
    assert.equal(markSpoilers('nothing hidden', []), 'nothing hidden');
  });

  test('ignores formatting that is not a spoiler', () => {
    assert.equal(markSpoilers('bold move', [{ type: 'bold', offset: 0, length: 4 }]), 'bold move');
  });

  test('wraps a spoiler range in markers', () => {
    assert.equal(
      markSpoilers('the ending: he lives', [spoiler(12, 8)]),
      'the ending: ||he lives||'
    );
  });

  test('wraps each of several spoilers separately', () => {
    assert.equal(markSpoilers('x y z', [spoiler(4, 1), spoiler(0, 1)]), '||x|| y ||z||');
  });

  // Markers with whitespace just inside them would not be recognised on the
  // way back out, so the whitespace stays outside.
  test('keeps surrounding whitespace outside the markers', () => {
    assert.equal(markSpoilers('ending: he lives', [spoiler(7, 9)]), 'ending: ||he lives||');
  });

  test('marks a multi-line spoiler one line at a time', () => {
    assert.equal(
      markSpoilers('act one\n\nact two', [spoiler(0, 16)]),
      '||act one||\n\n||act two||'
    );
  });

  test('counts offsets in UTF-16 units, as Telegram does', () => {
    // The clapper emoji is two UTF-16 code units.
    assert.equal(markSpoilers('🎬 ending: he lives', [spoiler(11, 8)]), '🎬 ending: ||he lives||');
  });

  test('merges overlapping and touching ranges instead of nesting markers', () => {
    assert.equal(markSpoilers('abcdef', [spoiler(0, 4), spoiler(2, 4)]), '||abcdef||');
    assert.equal(markSpoilers('abcdef', [spoiler(0, 3), spoiler(3, 3)]), '||abcdef||');
  });

  test('clips ranges to text that was truncated before marking', () => {
    assert.equal(markSpoilers('secret', [spoiler(2, 100)]), 'se||cret||');
    assert.equal(markSpoilers('secret', [spoiler(50, 10)]), 'secret');
  });

  test('leaves a whitespace-only spoiler unmarked', () => {
    assert.equal(markSpoilers('a   b', [spoiler(1, 3)]), 'a   b');
  });
});

describe('containsSpoiler', () => {
  test('finds a marked spoiler', () => {
    assert.equal(containsSpoiler('@alex: ||the captain survives||'), true);
  });

  test('recognises everything markSpoilers produces', () => {
    const marked = markSpoilers('ending:  he lives \nand more', [spoiler(7, 19)]);
    assert.equal(containsSpoiler(marked), true);
  });

  test('does not mistake a logical or for a spoiler', () => {
    assert.equal(containsSpoiler('if a || b || c then'), false);
  });

  test('does not match across lines', () => {
    assert.equal(containsSpoiler('||start\nend||'), false);
  });
});
