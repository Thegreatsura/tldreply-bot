import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatTelegramLink, linkMessageReferences } from './messageLinks';

describe('formatTelegramLink', () => {
  test('uses the public username when there is one', () => {
    assert.equal(formatTelegramLink(-1001234567890, 42, 'mygroup'), 'https://t.me/mygroup/42');
  });

  test('strips the -100 prefix for private supergroups', () => {
    assert.equal(formatTelegramLink(-1001234567890, 42), 'https://t.me/c/1234567890/42');
  });
});

describe('linkMessageReferences', () => {
  const chat = -1001234567890;
  const known = new Set([101, 102, 103]);

  test('links a single known citation', () => {
    assert.equal(
      linkMessageReferences('Decided on Friday [101].', chat, 'g', known),
      'Decided on Friday 101 (https://t.me/g/101).'
    );
  });

  test('links several citations and keeps the brackets', () => {
    assert.equal(
      linkMessageReferences('Venue chosen [101, 103]', chat, 'g', known),
      'Venue chosen [101 (https://t.me/g/101), 103 (https://t.me/g/103)]'
    );
  });

  // Regression: the model occasionally invents ids; those used to become dead links.
  test('drops citations the summarized set does not contain', () => {
    assert.equal(
      linkMessageReferences('Budget approved [999].', chat, 'g', known),
      'Budget approved.'
    );
    assert.equal(
      linkMessageReferences('Mixed [101, 999]', chat, 'g', known),
      'Mixed 101 (https://t.me/g/101)'
    );
  });

  test('rewrites a markdown link the model produced anyway', () => {
    assert.equal(
      linkMessageReferences('See [102](https://evil.example/x)', chat, 'g', known),
      'See 102 (https://t.me/g/102)'
    );
  });

  test('accepts # prefixes and duplicate ids', () => {
    assert.equal(
      linkMessageReferences('[#101, 101]', chat, 'g', known),
      '101 (https://t.me/g/101)'
    );
  });

  test('trusts every id when no set is given', () => {
    assert.equal(linkMessageReferences('[7]', chat, undefined), '7 (https://t.me/c/1234567890/7)');
  });

  test('leaves bullet indentation alone', () => {
    assert.equal(linkMessageReferences('  * point [999]', chat, 'g', known), '  * point');
  });
});
