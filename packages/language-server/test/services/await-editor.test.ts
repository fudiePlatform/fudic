/**
 * SDD-70 §4.1, criteria 24 and 25 — `@await` and `@catch` in the editor, piece by piece: the
 * snippets and where they go, the root plugin's door (no TypeScript mounted), the field being
 * typed after `@await data.`, and the colour of both words. The live round trip is
 * `acceptance/await.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionList } from '@volar/language-service';
import { URI } from 'vscode-uri';
import { DocumentCache, type CachedDocument } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { RequestStats } from '../../src/stats.js';
import { createFudicService } from '../../src/services/plugin.js';
import { snippetsAt } from '../../src/services/snippets.js';
import { awaitedFieldAt, laterFields } from '../../src/services/await.js';
import { semanticTokens } from '../../src/services/semantic-tokens.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { component, LAYOUT, memoryFs } from '../_support.js';

const ROUTE = '/p/src/routes/r.fud';
const API = 'load\n  title  str\n  users  Person[]  later\n  stats  Stats  later\n\ntype Person\n  id  i32\n\ntype Stats\n  n  i32\n';

const LINKS = '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./r.fudapi">\n';
const route = (body: string, head = '<title>t</title>'): string => `${LINKS}<head>\n  ${head}\n</head>\n<article>\n  ${body}\n</article>\n`;

/** The cached document at `path` with `|` removed, and the offset it marked. */
function cachedAt(marked: string, path = ROUTE, api = API, extra: Readonly<Record<string, string>> = {}) {
  const offset = marked.indexOf('|');
  const text = marked.replace('|', '');
  const index = new WorkspaceIndex(
    memoryFs({
      '/p/src/layouts/_layout.fud': LAYOUT,
      '/p/src/routes/r.fudapi': api,
      ...extra,
      [path]: text,
    }),
  );
  index.scan('/p');
  return { index, cached: new DocumentCache(index).get(path, 1, text), offset, text };
}

/** The labels of the snippets at `|`, with `hasLater` given. */
const snippetLabels = (marked: string, hasLater: boolean, path = ROUTE): readonly string[] => {
  const { cached, offset } = cachedAt(marked, path);
  return snippetsAt(cached, offset, undefined, hasLater).map((s) => s.label);
};

describe('the `@await` snippet (criterion 24)', () => {
  it('in the body of a route or a page whose `.fudapi` has a later field', () => {
    expect(snippetLabels(route('@|'), true)).toContain('@await');
    const page = '<!DOCTYPE html>\n<html>\n<head><title>t</title></head>\n<body>\n  @|\n</body>\n</html>\n';
    expect(snippetLabels(page, true, '/p/src/pages/index.fud')).toContain('@await');
  });

  it('not without one', () => {
    expect(snippetLabels(route('@|'), false)).not.toContain('@await');
  });

  it('not in the `<head>`, a component or a layout, whatever the contract says', () => {
    expect(snippetLabels(route('<p>x</p>', '<title>t</title>\n  @|'), true)).not.toContain('@await');
    expect(snippetLabels('<x-a>\n  <template shadowrootmode="open">@|</template>\n</x-a>\n', true, '/p/src/components/x-a.fud')).not.toContain('@await');
    expect(snippetLabels(LAYOUT.replace('@RenderBody()', '@|\n      @RenderBody()'), true, '/p/src/layouts/_other.fud')).not.toContain('@await');
  });

  it('leaves `@await data.` behind, and asks for the list again', () => {
    const { cached, offset } = cachedAt(route('@|'));
    const snippet = snippetsAt(cached, offset, undefined, true).find((s) => s.label === '@await');
    expect(snippet?.body).toBe('@await data.$1 {\n  $0\n}');
    expect(snippet?.suggest).toBe(true);
  });
});

describe('the `@catch` snippet (criterion 25)', () => {
  const offered = (body: string): boolean => snippetLabels(route(body), true).includes('@catch');

  it('right after the `}` of an `@await` with no catch, on its line or the next', () => {
    expect(offered('@await data.users { <p>x</p> } |@')).toBe(true);
    expect(offered('@await data.users { <p>x</p> }\n  |@ca')).toBe(true);
  });

  it('not after one that has it, nor after an `@if`, nor with something between', () => {
    expect(offered('@await data.users { } @catch (e) { } |@')).toBe(false);
    expect(offered('@if (a) { <b>x</b> } |@')).toBe(false);
    expect(offered('@await data.users { } <p>y</p> |@')).toBe(false);
  });

  it('not before the `@await`, nor after one that never got its body', () => {
    expect(offered('|@ @await data.users { }')).toBe(false);
    expect(offered('@await data.users |@')).toBe(false);
  });

  it('inserts the block, with the name of the problem as its first stop', () => {
    const { cached, offset } = cachedAt(route('@await data.users { } |@'));
    expect(snippetsAt(cached, offset, undefined, true).find((s) => s.label === '@catch')?.body).toBe('@catch (${1:e}) {\n  $0\n}');
  });
});

describe('the root plugin, with no TypeScript mounted (§8.2.7: the other door)', () => {
  async function complete(marked: string, api = API): Promise<CompletionList | undefined> {
    const { index, cached, offset, text } = cachedAt(marked, ROUTE, api);
    const uri = URI.file(ROUTE).toString();
    const document = TextDocument.create(uri, 'fud', 1, text);
    const service = createFudicService({ index, stats: new RequestStats(), typescript: false }).create(
      fakeServiceContext({ [uri]: cached }, () => undefined),
    );
    return (await service.provideCompletionItems?.(document, document.positionAt(offset), { triggerKind: 1 }, TOKEN)) as
      | CompletionList
      | undefined;
  }

  it('offers `@await` with the command that reopens the list', async () => {
    const item = (await complete(route('@|')))?.items.find((i) => i.label === '@await');
    expect(item?.textEdit?.newText).toBe('@await data.$1 {\n  $0\n}');
    expect(item?.command?.command).toBe('editor.action.triggerSuggest');
  });

  it('and not for a contract with no later field', async () => {
    const labels = (await complete(route('@|'), 'load\n  title  str\n'))?.items.map((i) => i.label);
    expect(labels).toContain('@if');
    expect(labels).not.toContain('@await');
  });

  it('offers `@catch` after the `}`, without a command: its first stop is a name', async () => {
    const item = (await complete(route('@await data.users { } |@')))?.items.find((i) => i.label === '@catch');
    expect(item?.textEdit?.newText).toBe('@catch (${1:e}) {\n  $0\n}');
    expect(item?.command).toBeUndefined();
  });
});

describe('the fields the route can wait for', () => {
  it('every later field of every linked `.fudapi`, with its type', () => {
    const marked = `${LINKS.replace('\n<link rel="server"', '\n<link rel="server" href="./more.fudapi">\n<link rel="server"')}<article>|</article>\n`;
    const { cached } = cachedAt(marked, ROUTE, API, { '/p/src/routes/more.fudapi': 'get search\n  -> str\n\nload\n  extra  str  later\n' });
    expect(laterFields(cached)).toEqual([
      { name: 'extra', type: 'str' },
      { name: 'users', type: 'Person[]' },
      { name: 'stats', type: 'Stats' },
    ]);
  });

  it('none when no link gives one', () => {
    expect(laterFields(cachedAt(route('|'), ROUTE, 'load\n  title  str\n').cached)).toEqual([]);
  });
});

describe('the field being typed after `@await data.`', () => {
  const at = (marked: string) => {
    const { cached, offset, text } = cachedAt(route(marked));
    const found = awaitedFieldAt(cached, offset);
    return found === undefined ? undefined : { text: found.text, written: text.slice(found.span.start, found.span.end) };
  };

  it('nothing typed yet, and a name begun', () => {
    expect(at('@await data.| { }')).toEqual({ text: '', written: '' });
    expect(at('@await data.us| { }')).toEqual({ text: 'us', written: 'us' });
  });

  it('in the second of two `@await`', () => {
    expect(at('@await data.users { } @await data.st| { }')).toEqual({ text: 'st', written: 'st' });
  });

  it('nothing before the dot, in another shape, or outside what is awaited', () => {
    expect(at('@await dat| { }')).toBeUndefined();
    expect(at('@await signal(|) { }')).toBeUndefined();
    expect(at('@await data.users { <p>@data.|</p> }')).toBeUndefined();
    expect(at('<p>@data.|</p>')).toBeUndefined();
  });
});

describe('the colour of `@await` and `@catch`', () => {
  function directives(body: string): readonly string[] {
    const source = `<link rel="component" href="../components/app-badge.fud">\n${route(body)}`;
    const index = new WorkspaceIndex(
      memoryFs({
        '/p/src/layouts/_layout.fud': LAYOUT,
        '/p/src/components/app-badge.fud': component('app-badge'),
        '/p/src/routes/r.fudapi': API,
        [ROUTE]: source,
      }),
    );
    index.scan('/p');
    const tokens = semanticTokens(new DocumentCache(index).get(ROUTE, 1, source) as CachedDocument).map(
      (token) => [token.type, source.slice(token.span.start, token.span.end)] as const,
    );
    expect(tokens).toContainEqual(['fudComponentTag', 'app-badge']);
    return tokens.filter(([type]) => type === 'fudDirective').map(([, text]) => text);
  }

  it('marks both words as directives, and walks both blocks', () => {
    expect(directives('@await data.users { <p>x</p> } @catch (e) { <app-badge></app-badge> }')).toEqual(['await', 'catch']);
  });

  it('marks the one word of an `@await` with no catch', () => {
    expect(directives('@await data.users { <app-badge></app-badge> }')).toEqual(['await']);
  });
});
