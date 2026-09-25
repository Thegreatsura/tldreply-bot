import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, markdownToHtml } from './formatter';
import { markSpoilers } from './spoilers';

describe('escapeHtml', () => {
  test('neutralises tags a Telegram display name could carry', () => {
    assert.equal(escapeHtml('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;');
  });

  test('neutralises an injected link', () => {
    assert.equal(
      escapeHtml('<a href="https://evil.example">Bank</a>'),
      '&lt;a href=&quot;https://evil.example&quot;&gt;Bank&lt;/a&gt;'
    );
  });

  test('escapes ampersands first so entities are not double-formed', () => {
    assert.equal(escapeHtml('a & <b'), 'a &amp; &lt;b');
  });

  test('leaves ordinary and non-Latin text untouched', () => {
    assert.equal(escapeHtml('ገና በዓል — Q3 planning'), 'ገና በዓል — Q3 planning');
  });
});

describe('markdownToHtml spoilers', () => {
  test('renders ||text|| as a Telegram spoiler', () => {
    assert.equal(
      markdownToHtml('@alex: ||the captain survives||'),
      '@alex: <tg-spoiler>the captain survives</tg-spoiler>'
    );
  });

  test('keeps formatting inside a spoiler', () => {
    assert.equal(
      markdownToHtml('* ending: ||**he** lives||'),
      '• ending: <tg-spoiler><b>he</b> lives</tg-spoiler>'
    );
  });

  test('escapes markup inside a spoiler', () => {
    assert.equal(markdownToHtml('||<script>||'), '<tg-spoiler>&lt;script&gt;</tg-spoiler>');
  });

  test('leaves a logical or alone', () => {
    assert.equal(markdownToHtml('if a || b || c'), 'if a || b || c');
  });

  test('renders what the message cache stores', () => {
    const cached = markSpoilers('act one\nact two', [{ type: 'spoiler', offset: 0, length: 15 }]);
    assert.equal(
      markdownToHtml(cached),
      '<tg-spoiler>act one</tg-spoiler>\n<tg-spoiler>act two</tg-spoiler>'
    );
  });
});
