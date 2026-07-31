/**
 * Acceptance criteria 6 to 10: opaque regions, Razor comments, CSS with Razor, inline
 * adjacency and long attribute lists.
 */

import { describe, expect, it } from 'vitest';
import { format } from '../../src/index.js';
import { corpus, formatted } from './_corpus.js';

const fixture = (name: string) => corpus.find((f) => f.name === name)!;

/** The body of the first element with this tag, as written. */
function bodyOf(source: string, tag: string): string {
  const open = source.indexOf(`<${tag}`);
  const start = source.indexOf('>', open) + 1;
  return source.slice(start, source.indexOf(`</${tag}>`, start));
}

describe('criterion 6 — opaque regions come out byte for byte', () => {
  const opaque = fixture('own/opaque.fud');

  it.each(['pre', 'textarea', 'script'])('%s keeps its own bytes, indentation included', async (tag) => {
    const out = await formatted(opaque);
    expect(bodyOf(out, tag)).toBe(bodyOf(opaque.source, tag));
  });

  it('keeps them even when the element around them changes level', async () => {
    // The container is moved two levels deeper; nothing inside the opaque regions may move.
    const moved = opaque.source.replace(
      '    <div>',
      '    <section>\n      <div>',
    ).replace('    </div>', '      </div>\n    </section>');
    const before = await formatted(opaque);
    const after = await format(moved);
    expect(after.ok).toBe(true);
    for (const tag of ['pre', 'textarea', 'script']) {
      expect(bodyOf(after.ok ? after.text : '', tag)).toBe(bodyOf(before, tag));
    }
  });

  it('narrowing the margin does not reach inside them either', async () => {
    const narrow = await format(opaque.source, { printWidth: 20 });
    expect(narrow.ok).toBe(true);
    expect(bodyOf(narrow.ok ? narrow.text : '', 'pre')).toBe(bodyOf(opaque.source, 'pre'));
  });
});

describe('criterion 7 — no Razor comment disappears', () => {
  it('keeps every one of them, in content and in the two trivia positions', async () => {
    const comments = fixture('own/comments.fud');
    const out = await formatted(comments);
    const all = comments.source.match(/@\*[\s\S]*?\*@/gu) ?? [];
    expect(all.length).toBeGreaterThan(6);
    for (const comment of all) expect(out).toContain(comment);
  });

  it('keeps the one between a brace and its else, which is not even a node', async () => {
    const source = '@if (a) {\n  <p>x</p>\n} @* survive *@ else {\n  <p>y</p>\n}\n';
    const out = await format(source);
    expect(out.ok && out.text).toContain('} @* survive *@ else {');
  });

  it('keeps them across the whole corpus, whatever the margin', async () => {
    for (const item of corpus) {
      const all = item.source.match(/@\*[\s\S]*?\*@/gu) ?? [];
      if (all.length === 0) continue;
      const out = await format(item.source, { printWidth: 40 });
      for (const comment of all) expect(out.ok && out.text).toContain(comment);
    }
  });
});

describe('criterion 8 — CSS with Razor', () => {
  const css = fixture('own/css-razor.fud');

  it('formats the sheet and puts every Razor region back exactly', async () => {
    const out = await formatted(css);
    expect(out).toContain('@media (min-width: @bp.tablet)');
    expect(out).toContain('color: @(theme.fg)');
    expect(out).toContain('--accent: @(theme.accent)');
  });

  it('actually formatted it, rather than giving up and copying', async () => {
    const out = await formatted(css);
    // `:host { display: block; color: @(theme.fg); }` was one line in the source.
    expect(out).toContain(':host {\n      display: block;');
    const result = await format(css.source);
    expect(result.ok && result.notes).toEqual([]);
  });
});

describe('criterion 9 — inline adjacency', () => {
  it('never breaks inside the real <app-badge>, however narrow the margin', async () => {
    const badge = fixture('lsp/blog/[slug].fud');
    for (const printWidth of [100, 60, 40, 20]) {
      const out = await format(badge.source, { printWidth });
      expect(out.ok && out.text).toContain(
        `<app-badge tone="@(data.found ? 'info' : 'neutral')">@data.tag</app-badge>`,
      );
    }
  });

  it('the line it sits on is longer than the margin, and that is the point', async () => {
    const badge = fixture('lsp/blog/[slug].fud');
    const out = await format(badge.source, { printWidth: 40 });
    const line = (out.ok ? out.text : '').split('\n').find((l) => l.includes('<app-badge'))!;
    expect(line.length).toBeGreaterThan(40);
  });
});

describe('criterion 10 — long attribute lists', () => {
  it('keeps the three attributes of the <span> one per line', async () => {
    const attrs = fixture('own/attributes.fud');
    const out = await formatted(attrs);
    expect(out).toContain(
      [
        '    <span',
        '      class="badge"',
        `      class:success="@(tone === 'success')"`,
        `      class:warning="@(tone === 'warning')">`,
      ].join('\n'),
    );
  });

  it('does not collapse it to a line of 120 columns, even though it would fit', async () => {
    const attrs = fixture('own/attributes.fud');
    const out = await formatted(attrs);
    expect(out).not.toContain('<span class="badge" class:success=');
  });

  it('leaves a tag the author wrote on one line on one line', async () => {
    const attrs = fixture('own/attributes.fud');
    const out = await formatted(attrs);
    expect(out).toContain('<a href="/blog/@tone/" title="one line" hidden>link</a>');
  });
});
