import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Api } from 'grammy';
import {
  deleteSecretMessage,
  editHtmlMessage,
  isHtmlParseError,
  secretDeletionNotice,
  sendHtmlMessage,
  warnIfSecretRemains,
} from './telegram';

/** Minimal stand-in for grammy's Api, recording what was called. */
function fakeApi(opts: { deleteThrows?: boolean; sendThrows?: boolean } = {}) {
  const calls = { deleted: [] as Array<[number, number]>, sent: [] as string[] };
  const api = {
    deleteMessage: async (chatId: number, messageId: number) => {
      if (opts.deleteThrows) throw new Error('message to delete not found');
      calls.deleted.push([chatId, messageId]);
      return true;
    },
    sendMessage: async (_chatId: number, text: string) => {
      if (opts.sendThrows) throw new Error('bot was blocked by the user');
      calls.sent.push(text);
      return {} as never;
    },
  } as unknown as Api;
  return { api, calls };
}

describe('deleteSecretMessage', () => {
  test('deletes the message and reports success', async () => {
    const { api, calls } = fakeApi();
    assert.equal(await deleteSecretMessage(api, 42, 100), true);
    assert.deepEqual(calls.deleted, [[42, 100]]);
  });

  test('swallows a Telegram failure and reports it', async () => {
    const { api } = fakeApi({ deleteThrows: true });
    assert.equal(await deleteSecretMessage(api, 42, 100), false);
  });

  // A missing message_id must not blow up the calling flow.
  test('is a no-op without a message id', async () => {
    const { api, calls } = fakeApi();
    assert.equal(await deleteSecretMessage(api, 42, undefined), false);
    assert.deepEqual(calls.deleted, []);
  });
});

describe('warnIfSecretRemains', () => {
  test('says nothing when the message was deleted', async () => {
    const { api, calls } = fakeApi();
    await warnIfSecretRemains(api, 42, true);
    assert.deepEqual(calls.sent, []);
  });

  test('warns the user when the key is still in the chat', async () => {
    const { api, calls } = fakeApi();
    await warnIfSecretRemains(api, 42, false);
    assert.equal(calls.sent.length, 1);
    assert.match(calls.sent[0], /could not delete/i);
    assert.match(calls.sent[0], /delete it yourself/i);
  });

  // If even the warning cannot be sent, the caller must still complete.
  test('does not throw when the warning itself fails', async () => {
    const { api } = fakeApi({ sendThrows: true });
    await assert.doesNotReject(() => warnIfSecretRemains(api, 42, false));
  });
});

describe('secretDeletionNotice', () => {
  test('reassures only on success', () => {
    assert.match(secretDeletionNotice(true), /deleted from this chat/);
    assert.equal(secretDeletionNotice(false), '', 'failure is reported separately');
  });
});

describe('HTML fallback', () => {
  /** An Api whose HTML sends fail the way Telegram fails on bad markup. */
  function parseFailingApi() {
    const sent: Array<{ text: string; parseMode?: string }> = [];
    const api = {
      sendMessage: async (_chatId: number, text: string, extra?: { parse_mode?: string }) => {
        if (extra?.parse_mode === 'HTML') {
          throw new Error('Bad Request: can\'t parse entities: Unsupported start tag "x"');
        }
        sent.push({ text, parseMode: extra?.parse_mode });
        return {} as never;
      },
      editMessageText: async (
        _chatId: number,
        _messageId: number,
        text: string,
        extra?: { parse_mode?: string }
      ) => {
        if (extra?.parse_mode === 'HTML') throw new Error("can't parse entities");
        sent.push({ text, parseMode: extra?.parse_mode });
        return {} as never;
      },
    } as unknown as Api;
    return { api, sent };
  }

  test('recognises Telegram parse errors only', () => {
    assert.equal(isHtmlParseError(new Error("Bad Request: can't parse entities")), true);
    assert.equal(isHtmlParseError(new Error('Bad Request: message is too long')), false);
  });

  // Regression: a summary Telegram could not parse used to be lost entirely.
  test('resends as plain text when the HTML is rejected', async () => {
    const { api, sent } = parseFailingApi();
    await sendHtmlMessage(api, 1, '<b>Title</b> &amp; <x>');

    assert.equal(sent.length, 1);
    assert.equal(sent[0].text, 'Title & ');
    assert.equal(sent[0].parseMode, undefined);
  });

  test('applies the same fallback to edits', async () => {
    const { api, sent } = parseFailingApi();
    await editHtmlMessage(api, 1, 2, '<i>hi</i>');

    assert.deepEqual(sent, [{ text: 'hi', parseMode: undefined }]);
  });

  test('rethrows anything that is not a parse error', async () => {
    const api = {
      sendMessage: async () => {
        throw new Error('Forbidden: bot was kicked');
      },
    } as unknown as Api;
    await assert.rejects(() => sendHtmlMessage(api, 1, 'x'), /kicked/);
  });
});
