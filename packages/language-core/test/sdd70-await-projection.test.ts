/**
 * SDD-70 criterion 3 — `@await data.users { … } @catch (e) { … }` in the projection.
 *
 * Measured against the real checker and the real language service over the corpus: inside the
 * body `data.users` has the type the field resolves to (hover and completion say so), outside it
 * is still the promise, and the name of the `@catch` is a `Problem`.
 */

import { describe, expect, it } from 'vitest';
import { mapToGenerated } from '../src/mapping.js';
import { collectTags, templateContent } from '../src/imports.js';
import { emitClient, parseFud } from './_support.js';
import { languageServiceFor, projectCorpus, typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

const SLUG = 'blog/[slug].fud';

/** `LoadData` of the slug with two `later` fields, as the host generates it (SDD-70 criterion 1). */
const API = `declare module 'fudic:blog/[slug]' {
  export interface Person {
    readonly id: number;
    readonly name: string;
  }
  export interface LoadData {
    readonly title: string;
    readonly tag: string;
    readonly body: string;
    readonly found: boolean;
    readonly note?: string;
    readonly users: Promise<readonly Person[]>;
    readonly stats: Promise<{ readonly visits: number }>;
  }
}
`;

/** The slug route with `markup` as its whole `<article>`. */
const slug = (markup: string): string => `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/site-nav.fud">
<link rel="component" href="../components/app-badge.fud">
<link rel="server" href="./[slug].fudapi">

@section nav {
  <site-nav .current="blog"></site-nav>
}

<article>
  ${markup}
</article>
`;

const BODY = `@await data.users {
    <ul>
      @foreach (const user of data.users) key (user.id) {
        <li>@user.name</li>
      }
    </ul>
  } @catch (e) {
    <p>@e.status @e.title @e.detail</p>
  }`;

const overrides = (markup: string): Record<string, string> => ({ [SLUG]: slug(markup), 'fudic-api.d.ts': API });

/** The checker's complaints about the slug. */
function diagnosticsOf(markup: string): readonly CorpusDiagnostic[] {
  return typecheckCorpus(overrides(markup)).filter((d) => d.fud === SLUG);
}

/** The client virtual of the slug with `markup`, and the source it was projected from. */
function project(markup: string) {
  const files = overrides(markup);
  const virtual = projectCorpus(files).find((p) => p.file.path === SLUG)!.virtuals[0]!;
  return { source: files[SLUG]!, virtual, files };
}

/** What TypeScript shows on hover at the `delta`-th character of the `nth` `needle` of the slug. */
function hoverAt(markup: string, needle: string, delta = 0, nth = 0): string {
  const { source, virtual, files } = project(markup);
  let at = -1;
  for (let i = 0; i <= nth; i++) at = source.indexOf(needle, at + 1);
  const generated = mapToGenerated(virtual, at + delta, 'navigation');
  expect(generated, `${needle} maps into the projection`).toBeDefined();
  const { service, pathOf } = languageServiceFor(files);
  const info = service.getQuickInfoAtPosition(pathOf(virtual.fileName), generated!);
  return (info?.displayParts ?? []).map((p) => p.text).join('').replace(/\s+/gu, ' ');
}

/** The completion entries at the end of the `nth` `needle` of the slug, with the type of each. */
function completionsAfter(markup: string, needle: string, nth = 0): ReadonlyMap<string, string> {
  const { source, virtual, files } = project(markup);
  let at = -1;
  for (let i = 0; i <= nth; i++) at = source.indexOf(needle, at + 1);
  const generated = mapToGenerated(virtual, at + needle.length, 'completion');
  expect(generated, `${needle} maps into the projection`).toBeDefined();
  const { service, pathOf } = languageServiceFor(files);
  const file = pathOf(virtual.fileName);
  const entries = service.getCompletionsAtPosition(file, generated!, undefined)?.entries ?? [];
  return new Map(
    entries.map((e) => {
      const details = service.getCompletionEntryDetails(file, generated!, e.name, undefined, undefined, undefined, undefined);
      return [e.name, (details?.displayParts ?? []).map((p) => p.text).join('')] as const;
    }),
  );
}

describe('the projection of `@await` (criterion 3)', () => {
  it('compiles: the body reads the field resolved, the catch reads a Problem', () => {
    expect(diagnosticsOf(BODY)).toEqual([]);
  });

  it('outside the `@await`, the field is still the promise', () => {
    const found = diagnosticsOf(`<p>@data.users.length</p>\n  ${BODY}`);
    // TS2339: «Property 'length' does not exist on type 'Promise<readonly Person[]>'».
    expect(found.map((d) => [d.code, d.sourceText])).toEqual([[2339, 'length']]);
    expect(found[0]!.message).toContain('Promise');
  });

  it('the body of the `@await` of one field leaves the other one a promise', () => {
    const found = diagnosticsOf('@await data.stats { <p>@data.stats.visits @data.users.length</p> }');
    expect(found.map((d) => [d.code, d.sourceText])).toEqual([[2339, 'length']]);
  });

  it('the catch name is a Problem, and nothing else', () => {
    const found = diagnosticsOf('@await data.users { } @catch (e) { <p>@e.stack</p> }');
    expect(found.map((d) => [d.code, d.sourceText])).toEqual([[2339, 'stack']]);
    expect(found[0]!.message).toContain('$Problem');
  });

  it('the hover over the field inside the body shows its resolved type', () => {
    expect(hoverAt(BODY, 'data.users)', 5)).toBe('(property) users: readonly Person[]');
  });

  it('the hover over what is awaited shows the promise', () => {
    expect(hoverAt(BODY, 'data.users {', 5)).toBe('(property) LoadData.users: Promise<readonly Person[]>');
  });

  it('the hover over the catch name, and over its use, says Problem', () => {
    expect(hoverAt(BODY, '(e)', 1)).toBe('const e: $Problem');
    expect(hoverAt(BODY, '@e.status', 1)).toBe('const e: $Problem');
    expect(hoverAt(BODY, '@e.status', 3)).toBe('(property) $Problem.status: number');
  });

  it('completion after `data.` inside the body offers the field with its resolved type', () => {
    const offered = completionsAfter('@await data.users { <p>@data.</p> }', '@data.');
    expect(offered.get('users')).toBe('(property) users: readonly Person[]');
    expect(offered.get('title')).toBe('(property) title: string');
  });

  it('completion after `data.` in what is awaited offers the fields of data', () => {
    const offered = completionsAfter('@await data. { }', 'data.');
    expect([...offered.keys()]).toEqual(expect.arrayContaining(['users', 'stats', 'title']));
  });
});

describe('the projection of what is not a field', () => {
  it('copies the expression, and lets the body read the `data` around it', () => {
    const text = emitClient(slug('@await signal() { <p>@data.title</p> }')).text;
    expect(text).toContain('void (signal());');
    expect(text).not.toContain('$await(');
    expect(text).not.toContain('$problem()');
  });

  it('names the outer `data` after the offset of the `@await`, so two of them do not collide', () => {
    const source = slug('@await data.users { } @await data.stats { }');
    const text = emitClient(source).text;
    expect(text).toContain(`const $data${source.indexOf('@await data.users')} = data;`);
    expect(text).toContain(`$await($data${source.indexOf('@await data.stats')}, 'stats')`);
  });

  it('two awaits of different fields type check side by side', () => {
    expect(diagnosticsOf('@await data.users { <p>@data.users.length</p> } @await data.stats { <p>@data.stats.visits</p> }')).toEqual([]);
  });
});

describe('the tags inside an `@await`', () => {
  it('are collected from its body and its catch, so their contracts are imported', () => {
    const tags = (markup: string) => collectTags(templateContent(parseFud(slug(markup))));
    expect(tags('@await data.users { <app-badge></app-badge> } @catch (e) { <app-list></app-list> }')).toEqual(
      expect.arrayContaining(['app-badge', 'app-list']),
    );
    expect(tags('@await data.users { <app-badge></app-badge> }')).toContain('app-badge');
  });
});
