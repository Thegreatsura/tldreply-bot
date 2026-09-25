/**
 * Spoiler handling.
 *
 * Telegram hides spoiler text behind a tap-to-reveal blur, but it arrives as a
 * `spoiler` entity next to plain text, and the cache used to keep only the
 * text. Summaries then repeated whatever the sender had hidden - episode
 * endings, match results, quiz answers - in the clear.
 *
 * Spoilers are kept inline as ||text||, Telegram's own MarkdownV2 syntax and
 * one the model already knows. That lets them survive the cache, the prompt
 * and archived summaries without a schema change; markdownToHtml turns them
 * back into <tg-spoiler> on the way out.
 */

/** The fields of a Telegram MessageEntity this module reads. */
interface Entity {
  type: string;
  offset: number;
  length: number;
}

/**
 * One single-line ||spoiler||. The content may not start or end with
 * whitespace, so a logical `a || b || c` is not mistaken for one.
 */
const SPOILER_SOURCE = String.raw`\|\|(?=\S)([^\n]*?\S)\|\|`;

/** Whether text carries at least one ||spoiler|| marker. */
export function containsSpoiler(text: string): boolean {
  return new RegExp(SPOILER_SOURCE).test(text);
}

/** Replaces each ||spoiler|| with the result of `render`. */
export function replaceSpoilers(text: string, render: (content: string) => string): string {
  return text.replace(new RegExp(SPOILER_SOURCE, 'g'), (_, content: string) => render(content));
}

/**
 * Wraps the spoiler ranges of a message in ||markers||.
 *
 * Entity offsets count UTF-16 code units, the same unit JavaScript string
 * indices use, so they apply to the text directly. Ranges running past the end
 * of `text` are clipped, so the text may be truncated before marking.
 *
 * Markers are placed per line and exclude surrounding whitespace, keeping
 * every marked range something containsSpoiler and markdownToHtml recognise.
 */
export function markSpoilers(text: string, entities: readonly Entity[] | undefined): string {
  const ranges = (entities ?? [])
    .filter(entity => entity.type === 'spoiler')
    .map(entity => ({
      start: Math.max(0, entity.offset),
      end: Math.min(text.length, entity.offset + entity.length),
    }))
    .filter(range => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  if (ranges.length === 0) return text;

  // Overlapping or touching ranges become one, so markers never nest.
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  let marked = '';
  let cursor = 0;
  for (const { start, end } of merged) {
    marked += text.slice(cursor, start);
    marked += text.slice(start, end).split('\n').map(wrapLine).join('\n');
    cursor = end;
  }
  return marked + text.slice(cursor);
}

function wrapLine(line: string): string {
  const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(line)!;
  return body ? `${lead}||${body}||${trail}` : line;
}
