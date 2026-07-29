/**
 * Templates (SDD-22 §4.2). They are REAL files under `templates/`, not strings inside the
 * code, and that is load-bearing: being real files they can be materialized and fed to the
 * compiler by a test, so a template that violates a grammar decision breaks the build of
 * this repository instead of a user's morning.
 *
 * Substitution is `{{name}}` and nothing else — no conditionals, no loops. Anything that
 * varies structurally is composed here from block builders, so every template stays a
 * document you can read.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** `templates/` sits next to `src/` in dev and next to `dist/` once built. */
const TEMPLATES_DIR = new URL('../templates/', import.meta.url);

export function templatePath(file: string): string {
  return fileURLToPath(new URL(file, TEMPLATES_DIR));
}

/**
 * Materialize a template. A placeholder with no value is a programming error, not a user
 * error: it would ship a `{{…}}` into a generated file. It throws, and `run()` turns any
 * throw into an exit code — the CLI never shows a stack trace (SDD-22 §5).
 */
export function renderTemplate(file: string, vars: Readonly<Record<string, string>>): string {
  const source = readFileSync(templatePath(file), 'utf8');
  const out = source.replace(/\{\{(\w+)\}\}/gu, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`template ${file}: no value for {{${key}}}`);
    return value;
  });
  return out;
}

/** The document role a `.fud` template must structure as, once materialized. */
export type TemplateRole = 'component-document' | 'route-document' | 'page-document' | 'layout-document';

export interface TemplateSpec {
  readonly file: string;
  readonly role: TemplateRole;
  readonly sample: Readonly<Record<string, string>>;
}

/**
 * Every `.fud` template with a sample materialization. Acceptance criterion §6.7 walks
 * this list; adding a template without adding it here is caught by the same test.
 */
export const TEMPLATES: readonly TemplateSpec[] = [
  {
    file: 'component.fud',
    role: 'component-document',
    sample: {
      head: styleBlock('app-card'),
      tag: 'app-card',
      className: 'app-card',
      body: '      <slot></slot>',
    },
  },
  {
    file: 'route.fud',
    role: 'route-document',
    sample: {
      layoutHref: '../layouts/_layout.fud',
      code: serverCodeBlock(),
      title: '@data.title',
      sections: sectionBlocks(['nav']),
    },
  },
  {
    file: 'page.fud',
    role: 'page-document',
    sample: { lang: 'en', title: 'Home', code: indent(serverCodeBlock(), '    ') },
  },
  {
    file: 'layout.fud',
    role: 'layout-document',
    sample: { lang: 'en', renderHead: '    @RenderHead()', sections: renderSectionBlocks(['nav']) },
  },
];

// ── Block builders: the parts that vary structurally ──────────────────────────

/**
 * The component's `<head>` with its single `<style>` (decision 62). The `host="<tag>"`
 * marker is NOT written here: serialization adds it (decisions 67/70), and a template that
 * wrote it by hand would be teaching the user to do the compiler's job.
 */
export function styleBlock(tag: string): string {
  return `<head>
  <style>
    :host { display: block; }

    .${tag} {
      /* ${tag} styles */
    }
  </style>
</head>

`;
}

/** `@code { @server { load() } }` — the data hook of a route (decision 60 / SDD-21 §4.3). */
export function serverCodeBlock(): string {
  return `
@code {
  type PageData = { title: string };

  @server {
    export async function load(): Promise<PageData> {
      return { title: 'Untitled' };
    }
  }
}
`;
}

/** One `@section name { … }` per name, in the order given (decision 84). */
export function sectionBlocks(names: readonly string[]): string {
  if (names.length === 0) return '';
  return `\n${names.map((name) => `@section ${name} {\n}\n`).join('\n')}`;
}

/** One `@RenderSection(name)` per name — a bare identifier, never a string (decision 85). */
export function renderSectionBlocks(names: readonly string[]): string {
  return names.map((name) => `    @RenderSection(${name})\n`).join('');
}

/** Indent every non-empty line of a block. */
export function indent(block: string, prefix: string): string {
  return block
    .split('\n')
    .map((line) => (line === '' ? line : `${prefix}${line}`))
    .join('\n');
}
