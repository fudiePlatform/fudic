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
export type TemplateRole = 'component-document' | 'route-document' | 'page-document' | 'layout-document' | 'snippet-document';

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
      head: styleBlock(),
      tag: 'app-card',
      body: '    <slot></slot>\n',
    },
  },
  {
    file: 'route.fud',
    role: 'route-document',
    sample: {
      layoutHref: '../layouts/_layout.fud',
      code: serverLink('./about.fudapi'),
      title: '@data.title',
      sections: sectionBlocks(['nav']),
    },
  },
  {
    file: 'page.fud',
    role: 'page-document',
    sample: { lang: 'en', title: 'Home', code: indent(serverLink('./index.fudapi'), '    ') },
  },
  {
    file: 'layout.fud',
    role: 'layout-document',
    sample: { lang: 'en', renderHead: '    @RenderHead()', sections: renderSectionBlocks(['nav']) },
  },
  {
    file: 'snippet.fud',
    role: 'snippet-document',
    sample: { name: 'productCard' },
  },
];

// ── Block builders: the parts that vary structurally ──────────────────────────

/**
 * The component's `<head>` with its single `<style>` (decision 62), empty.
 *
 * Empty on purpose. A generated `:host { display: block }` and a `.<tag>` rule are decisions
 * about a component nobody has written yet, and the wrapper `<div class="<tag>">` they styled
 * was a node the user did not ask for. The `host="<tag>"` marker is NOT written here either:
 * serialization adds it (decisions 67/70), and a template that wrote it by hand would be
 * teaching the user to do the compiler's job.
 */
export function styleBlock(): string {
  return `<head>
  <style></style>
</head>

`;
}

/**
 * `<link rel="server">` to the `.fudapi` beside the route (SDD-60 §3.14): where its `load` is
 * declared. The `.fud` itself carries no server code.
 */
export function serverLink(href: string): string {
  return `<link rel="server" href="${href}">`;
}

/**
 * The optional `prefix` field of `fudic.json`, with the comma that joins it to `kind`.
 *
 * A block builder and not a conditional in the template, because templates substitute and
 * nothing else (§4.2). `''` leaves the file without the field, which is what makes a
 * project generated without `--prefix` behave exactly as one from before SDD-41.
 */
export function prefixField(prefix: string): string {
  return prefix === '' ? '' : `,\n  "prefix": ${JSON.stringify(prefix)}`;
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

/**
 * What an app of a workspace tells Vite besides its plugin: the base URL it is served at and the
 * port `pnpm --filter <app> dev` takes (BUG-50 §4.5). An app at `/` writes no `base`.
 */
export function viteSettings(base: string, port: number): string {
  return `${base === '/' ? '' : `  base: '${base}',\n`}  server: { port: ${port} },\n`;
}

/** The unit test of a page: it visits `url` and expects the page to answer. */
export function pageTest(url: string): string {
  return renderTemplate('page.test.ts.tmpl', { url });
}

/**
 * The unit test of the layout in `file` (its name, `_layout.fud`): it renders a body inside it.
 * The module is named after the layout, `_layout` → `Layout`, `docs-shell` → `DocsShell`.
 */
export function layoutTest(file: string): string {
  return renderTemplate('layout.test.ts.tmpl', { module: moduleName(file.replace(/\.fud$/u, ''), 'Layout'), file });
}

/**
 * The name a `.fud` is imported under, `* as <Name>`: `ui-button` → `UiButton`. A name that would
 * not start with a letter gets `fallback` in front, `2col` → `Layout2col`.
 */
function moduleName(base: string, fallback: string): string {
  const words = base.split(/[^A-Za-z0-9]+/u).filter((word) => word !== '');
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return /^[A-Z]/u.test(name) ? name : `${fallback}${name}`;
}

/** The unit test of the component `tag`: it mounts it and expects its host in the document. */
export function componentTest(tag: string): string {
  return renderTemplate('component/test.ts.tmpl', { tag, module: moduleName(tag, 'Component') });
}

/** The `.fudspec` of a new component: one real criterion, `renders`, in stock terms. */
export function componentSpec(tag: string): string {
  return renderTemplate('component/fudspec.tmpl', { tag });
}

/** The fixture the criteria mount a new component with: `base`, empty, since it has no props yet. */
export function componentFixture(tag: string): string {
  return renderTemplate('component/fixture.ts.tmpl', { tag });
}

/** Indent every non-empty line of a block. */
export function indent(block: string, prefix: string): string {
  return block
    .split('\n')
    .map((line) => (line === '' ? line : `${prefix}${line}`))
    .join('\n');
}
