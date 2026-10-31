/**
 * SDD-70 §3.9 — the `load` line in the editor: after `buffer`, `ttl` and `page`, their values;
 * elsewhere, the options the line does not have yet; and a hover over each word and value.
 */

import { describe, expect, it } from 'vitest';
import { STREAM_BUFFER } from '@fudic/conventions';
import { CompletionItemKind, type CompletionItem, type MarkupContent } from 'vscode-languageserver-protocol';
import { apiCompletions } from '../../src/fudapi/completion.js';
import { loadHover } from '../../src/fudapi/load-line.js';
import { apiDocument, cursor, world } from './_api.js';

function items(marked: string): readonly CompletionItem[] {
  const { text, offset } = cursor(marked);
  return apiCompletions(apiDocument(world().host, text), offset)!.items;
}

const labels = (marked: string): readonly string[] => items(marked).map((i) => i.label);

function hover(marked: string): { readonly value: string; readonly word: string } | undefined {
  const { text, offset } = cursor(marked);
  const found = loadHover(apiDocument(world().host, text), offset);
  if (found === undefined) return undefined;
  const { start, end } = found.range!;
  const line = text.split('\n')[start.line]!;
  return { value: (found.contents as MarkupContent).value, word: line.slice(start.character, end.character) };
}

describe('completion of the load line', () => {
  it('after `buffer`: no buffer, the default and a larger one, in that order, as values', () => {
    const found = items('load ssr buffer |');
    expect(found.map((i) => [i.label, i.sortText, i.kind])).toEqual([
      ['0', '0', CompletionItemKind.Value],
      [`${STREAM_BUFFER / 1024}k`, '1', CompletionItemKind.Value],
      ['16k', '2', CompletionItemKind.Value],
    ]);
    expect(found.map((i) => (i.documentation as MarkupContent).value)).toEqual([
      'Each piece is sent as soon as it is produced.',
      '8192 bytes: the default, the same as no `buffer`.',
      '16384 bytes: fewer, larger writes.',
    ]);
  });

  it('while the value is being typed, the same values', () => {
    expect(labels('load buffer 1|')).toEqual(['0', '8k', '16k']);
  });

  it('after `ttl`: durations, each spelled out', () => {
    const found = items('load sw ttl |');
    expect(found.map((i) => i.label)).toEqual(['30s', '5m', '1h', '1d']);
    expect(found.map((i) => (i.documentation as MarkupContent).value)).toEqual(['30 seconds', '5 minutes', '1 hour', '1 day']);
  });

  it('after `page`: what it keeps, explained', () => {
    const found = items('load sw page |');
    expect(found.map((i) => i.label)).toEqual(['never', 'persist']);
    expect((found[0]!.documentation as MarkupContent).value).toContain('The default');
  });

  it('after a value, the options again', () => {
    expect(labels('load buffer 16k |')).toEqual([
      'ssg', 'ssr', 'sw', 'ttl', 'cache-first', 'network-first', 'stale-while-revalidate', 'network-only', 'page',
    ]);
  });

  it('what the line has is not offered again: one mode, one policy, each of the rest once', () => {
    expect(labels('load ssr ttl 5m network-first page never buffer 0 |')).toEqual([]);
    expect(labels('load sw cache-first |')).toEqual(['ttl', 'page', 'buffer']);
  });

  it('what comes after the cursor counts too, and the rest of the word typed does not', () => {
    expect(labels('load | buffer 0 ssr')).toEqual(['ttl', 'cache-first', 'network-first', 'stale-while-revalidate', 'network-only', 'page']);
    expect(labels('load s|sr')).toEqual(['ssg', 'ssr', 'sw', 'ttl', 'cache-first', 'network-first', 'stale-while-revalidate', 'network-only', 'page', 'buffer']);
    expect(labels('load | ssr # buffer')).not.toContain('ssr');
    expect(labels('load | ssr # buffer')).toContain('buffer');
  });

  it('each option says what it does', () => {
    const buffer = items('load |').find((i) => i.label === 'buffer')!;
    expect(buffer.kind).toBe(CompletionItemKind.Keyword);
    expect((buffer.documentation as MarkupContent).value).toContain(`Without it, ${STREAM_BUFFER}.`);
  });
});

describe('hover over the load line', () => {
  it('over `buffer` and its size', () => {
    expect(hover('load ssr buf|fer 16k')).toEqual({ value: expect.stringContaining('`buffer 0` sends each piece'), word: 'buffer' });
    expect(hover('load ssr buffer 16|k')).toEqual({ value: '16384 bytes held before the stream sends.', word: '16k' });
    expect(hover('load ssr buffer 4096|')).toEqual({ value: '4096 bytes held before the stream sends.', word: '4096' });
    expect(hover('load ssr buffer |0')?.value).toBe('Each piece is sent as soon as it is produced.');
  });

  it('over `load`, a mode, a policy and `page` with its value', () => {
    expect(hover('lo|ad ssr')?.value).toContain('`data`');
    expect(hover('load s|sg')?.value).toBe('Rendered once, at build time.');
    expect(hover('load sw stale-while-|revalidate')?.word).toBe('stale-while-revalidate');
    expect(hover('load sw pa|ge persist')?.value).toContain('`page persist`');
    expect(hover('load sw page per|sist')?.value).toContain('as long as the data');
  });

  it('over a duration, spelled out by what it follows', () => {
    expect(hover('load sw ttl 5|m')?.value).toBe('The data stays fresh 5 minutes.');
    expect(hover('load sw ttl 90|m')?.value).toBe('The data stays fresh 90 minutes.');
    expect(hover('load sw ttl 2|h')?.value).toBe('The data stays fresh 2 hours.');
    expect(hover('load sw page persist 1|d')?.value).toBe('The HTML is kept 1 day; the `ttl` wins when they differ.');
    expect(hover('load sw ttl 45|s')?.value).toBe('The data stays fresh 45 seconds.');
  });

  it('on a later line of the file, with \\r\\n too', () => {
    expect(hover('get f\r\n\r\nload ssr buffer 1|k\r\n  users  str[]')).toEqual({ value: '1024 bytes held before the stream sends.', word: '1k' });
  });

  it('nothing over a value that is not one, a stray word, a space, a comment or another line', () => {
    expect(hover('load ssr buffer x|')).toBeUndefined();
    expect(hover('load ssr ttl soon|')).toBeUndefined();
    expect(hover('load ssr nope|')).toBeUndefined();
    expect(hover('load ssr  | buffer 0')).toBeUndefined();
    expect(hover('load ssr # buff|er')).toBeUndefined();
    expect(hover('get f\n  buff|er  str')).toBeUndefined();
    expect(hover('loader buff|er')).toBeUndefined();
  });
});
