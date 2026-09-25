/**
 * Message citations in summaries.
 *
 * The model is asked to cite sources as bare ids in square brackets, [12345]
 * or [12345, 12351], and nothing else: no URLs. Links are built here, in code,
 * from ids that are known to exist in the summarized set. That keeps invented
 * ids from becoming dead links, keeps URLs pasted into the chat from being
 * echoed as citations, and keeps the prompt shorter than one URL per message.
 *
 * Output format is the one markdownToHtml already renders: a single citation
 * becomes `12345 (https://t.me/...)`, several become `[12345 (...), 12351 (...)]`.
 */

/** Public groups link by @username; private ones by the c/<internal id> form. */
export function formatTelegramLink(
  chatId: number,
  messageId: number,
  chatUsername?: string | null
) {
  if (chatUsername) {
    return `https://t.me/${chatUsername}/${messageId}`;
  }
  // Supergroup ids look like -1001234567890; the link wants the part after -100.
  const cleanId = Math.abs(chatId).toString().replace(/^100/, '');
  return `https://t.me/c/${cleanId}/${messageId}`;
}

/**
 * Turns [id] citations into message links, dropping ids that are not in
 * `knownIds`. With `knownIds` undefined every id is trusted, which is only
 * right when the caller has no message set to check against.
 */
export function linkMessageReferences(
  summary: string,
  chatId: number,
  chatUsername: string | null | undefined,
  knownIds?: ReadonlySet<number>
): string {
  const isKnown = (id: number) => knownIds === undefined || knownIds.has(id);
  const link = (id: number) => `${id} (${formatTelegramLink(chatId, id, chatUsername)})`;

  let out = summary;

  // Markdown links the model may still produce despite instructions: [123](url).
  out = out.replace(/\[(\d+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, id: string) =>
    isKnown(Number(id)) ? link(Number(id)) : ''
  );

  // [123], [#123], [123, 456]
  out = out.replace(/\[\s*#?\d+(?:\s*,\s*#?\d+)*\s*\]/g, match => {
    const ids = [...new Set((match.match(/\d+/g) ?? []).map(Number))].filter(isKnown);
    if (ids.length === 0) return '';
    if (ids.length === 1) return link(ids[0]);
    return `[${ids.map(link).join(', ')}]`;
  });

  // Tidy what a removed citation leaves behind: a space before punctuation or
  // a double space mid-line. Leading indentation is left alone.
  out = out
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/(?<=\S)[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');

  return out;
}
