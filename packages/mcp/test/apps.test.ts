/**
 * The answer as a chat reads it: the paths of the shots in `_meta` become the URLs the server
 * serves them at, for the view and for the model; and `shown` tells the model what the user
 * already sees, only when the client said it draws MCP Apps.
 */

import { describe, expect, it } from 'vitest';
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { forChat, VIEW_META_KEY } from '../src/apps.js';
import type { Answer } from '../src/respond.js';
import type { Site } from '../src/site.js';

/** A server whose client declared `capabilities`. */
const server = (capabilities: unknown): McpServer => ({ server: { getClientCapabilities: () => capabilities } }) as unknown as McpServer;

const DRAWS = server({ extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } });
const OTHER_UI = server({ extensions: { [EXTENSION_ID]: { mimeTypes: ['text/html'] } } });
const PLAIN = server({});

/** A site that serves the shots under `https://x.example/s/`, or none. */
const site = (serves: boolean): Site =>
  ({ shotUrl: (path: string) => (serves ? `https://x.example/s/${path.replace(/^\.fudic\//u, '')}` : undefined) }) as unknown as Site;

const view = (answer: Answer): unknown => answer.meta?.[VIEW_META_KEY];

describe('forChat', () => {
  it('an answer with no view: as it was', () => {
    const answer: Answer = { body: { a: 1 }, next: null };
    expect(forChat(DRAWS, site(true), answer)).toBe(answer);
    const other: Answer = { body: {}, meta: { other: 1 } };
    expect(forChat(DRAWS, site(true), other)).toBe(other);
  });

  it('a render: the view as it was; shown is html only for a client that draws MCP Apps', () => {
    const answer: Answer = { body: { outline: '- button' }, meta: { [VIEW_META_KEY]: { kind: 'render', html: '<p>x</p>' } } };
    expect(forChat(DRAWS, site(true), answer)).toEqual({ ...answer, body: { outline: '- button', shown: 'html' } });
    expect(forChat(OTHER_UI, site(true), answer)).toEqual(answer);
    expect(forChat(PLAIN, site(true), answer)).toEqual(answer);
  });

  it('a shot: its URL in the view and in the body; its path when nothing serves it', () => {
    const answer: Answer = { body: { outline: '' }, meta: { other: 1, [VIEW_META_KEY]: { kind: 'shot', png: '.fudic/renders/acme-button/props-1.png' } } };
    const served = forChat(DRAWS, site(true), answer);
    expect(served.body).toEqual({ outline: '', shot: 'https://x.example/s/renders/acme-button/props-1.png', shown: 'image' });
    expect(view(served)).toEqual({ kind: 'shot', png: 'https://x.example/s/renders/acme-button/props-1.png' });
    expect(served.meta?.['other']).toBe(1);
    const unserved = forChat(PLAIN, site(false), answer);
    expect(unserved.body).toEqual({ outline: '', shot: '.fudic/renders/acme-button/props-1.png' });
    expect(view(unserved)).toEqual({ kind: 'shot', png: '.fudic/renders/acme-button/props-1.png' });
  });

  it('a look: every before and after a URL, in the view and as beforeUrl and afterUrl beside each case', () => {
    const at = (hash: string, name: string): string => `.fudic/looks/acme-button/${hash}/${name}.png`;
    const answer: Answer = {
      body: {
        cases: [
          { case: 'primary', verdict: 'changed', before: at('a', 'primary'), after: at('b', 'primary') },
          { case: 'disabled', verdict: 'same' },
          { case: 'old', verdict: 'gone', before: at('a', 'old') },
          { case: 'fresh', verdict: 'new', after: at('b', 'fresh') },
          // A case the view does not draw stays as it was.
          { case: 'broken' },
        ],
      },
      meta: {
        [VIEW_META_KEY]: {
          kind: 'look',
          cases: [
            { case: 'primary', verdict: 'changed', before: at('a', 'primary'), after: at('b', 'primary') },
            { case: 'disabled', verdict: 'same', before: at('a', 'disabled'), after: at('b', 'disabled') },
            { case: 'old', verdict: 'gone', before: at('a', 'old') },
            { case: 'fresh', verdict: 'new', after: at('b', 'fresh') },
            { case: 'none', verdict: 'new' },
          ],
        },
      },
    };
    const url = (hash: string, name: string): string => `https://x.example/s/looks/acme-button/${hash}/${name}.png`;
    const drawn = forChat(DRAWS, site(true), answer);
    expect(drawn.body).toEqual({
      shown: 'image',
      cases: [
        { case: 'primary', verdict: 'changed', before: at('a', 'primary'), after: at('b', 'primary'), beforeUrl: url('a', 'primary'), afterUrl: url('b', 'primary') },
        { case: 'disabled', verdict: 'same', beforeUrl: url('a', 'disabled'), afterUrl: url('b', 'disabled') },
        { case: 'old', verdict: 'gone', before: at('a', 'old'), beforeUrl: url('a', 'old') },
        { case: 'fresh', verdict: 'new', after: at('b', 'fresh'), afterUrl: url('b', 'fresh') },
        { case: 'broken' },
      ],
    });
    expect(view(drawn)).toEqual({
      kind: 'look',
      cases: [
        { case: 'primary', verdict: 'changed', before: url('a', 'primary'), after: url('b', 'primary') },
        { case: 'disabled', verdict: 'same', before: url('a', 'disabled'), after: url('b', 'disabled') },
        { case: 'old', verdict: 'gone', before: url('a', 'old') },
        { case: 'fresh', verdict: 'new', after: url('b', 'fresh') },
        { case: 'none', verdict: 'new' },
      ],
    });
  });

  it('a view of another kind: as it was, and shown says image', () => {
    const answer: Answer = { body: {}, meta: { [VIEW_META_KEY]: { kind: 'other' } } };
    expect(forChat(DRAWS, site(true), answer)).toEqual({ ...answer, body: { shown: 'image' } });
  });
});
