/**
 * Shared helpers for the emit tests. Wires the REAL pipeline (SDD-05 parse + SDD-06/08
 * constructs + SDD-10 structure) exactly like the emit's own entry points do, so the
 * AST the emitters receive is authentic — never hand-forged.
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { SsrDom, serializeChunks, escapeText, escapeAttr, jsonBlock, packData } from '@fudic/ssr';
import { classDiff, classTokens, type ClassDiff } from '@fudic/dom';
import {
  emitComponentModule,
  emitLayoutModule,
  emitRouteModule,
  type ComponentGraph,
  type DocumentGraph,
  type EmitOptions,
} from '../../src/emit/index.js';
import {
  parseDocument,
  type AtConstructParser,
} from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import {
  structureDocument,
  type StructuredDocument,
} from '../../src/document/index.js';
import type { ResolveIo } from '../../src/emit/index.js';
import type { Prop, Reactive } from '../../src/emit/oxc-code.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

/** Parse a `.fud` source to its structured document (same path the emit uses). */
export function parse(source: string): StructuredDocument {
  return structureDocument(source, parseDocument(source, { atConstructs: constructs }).value).value;
}

const here = dirname(fileURLToPath(import.meta.url));
export const fixturesDir = resolve(here, '../../fixtures');

/**
 * The SDD-21 fixtures (layouts and routes) live under `test/`, NOT in `fixtures/`: that
 * directory doubles as the routes dir of the `@fudic/vite` tests, which scan it recursively
 * and treat every page-shaped file as a route. A layout is not a route (SDD-21 §4.7), and a
 * monolithic comparison page is not one either.
 */
export const layoutFixturesDir = resolve(here, '../fixtures');

/** Read a fixture `.fud` by file name. */
export function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

/** Read an SDD-21 fixture `.fud` (layout / route) by file name. */
export function layoutFixture(name: string): string {
  return readFileSync(join(layoutFixturesDir, name), 'utf8');
}

/** Filesystem-backed IO pointed at the fixtures dir, for `resolveComponents`. */
export const fixtureIo: ResolveIo = {
  read: (p) => readFileSync(p, 'utf8'),
  resolve: (from, href) => resolve(dirname(from), href),
};

/** Build an in-memory IO from a map of absolute-ish paths to source. */
export function memoryIo(files: Record<string, string>): ResolveIo {
  return {
    read: (p) => {
      const src = files[p];
      if (src === undefined) throw new Error(`no in-memory file: ${p}`);
      return src;
    },
    // A flat, POSIX-style join is enough for the in-memory graphs used in tests.
    resolve: (from, href) => {
      const base = from.slice(0, from.lastIndexOf('/') + 1);
      return normalize(base + href);
    },
  };
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

/**
 * A recording `Dom<N>` fake: every call appends a tagged record. Lets a test EXECUTE
 * an emitted render function and assert the exact adapter calls it makes, proving the
 * codegen runs — not just that its text matches.
 */
export interface DomCall {
  readonly op: string;
  readonly args: readonly unknown[];
}

export function recordingDom(): { dom: Record<string, (...a: unknown[]) => unknown>; calls: DomCall[] } {
  const calls: DomCall[] = [];
  let n = 0;
  const rec = (op: string) => (...args: unknown[]): unknown => {
    calls.push({ op, args });
    // Return a small handle so chained calls (append, setAttr) have something to name.
    return { $node: op, id: n++ };
  };
  const dom = {
    element: rec('element'),
    text: rec('text'),
    comment: rec('comment'),
    setAttr: rec('setAttr'),
    toggleClass: rec('toggleClass'),
    swapClass: rec('swapClass'),
    removeAttr: rec('removeAttr'),
    append: rec('append'),
    before: rec('before'),
    remove: rec('remove'),
    attachShadow: rec('attachShadow'),
    claim: rec('claim'),
    state: rec('state'),
  };
  return { dom, calls };
}

/**
 * A minimal `io` for executing an emitted `page(data, io)`: a tiny tree-building DOM and
 * a serializer good enough to prove the page module RUNS and produces the expected
 * structure (host + DSD `<template>` + light DOM). It is intentionally NOT @fudic/ssr —
 * just enough to assert on. `attachShadow` serializes as `<template shadowrootmode>`.
 */
interface TreeNode {
  tag?: string;
  attrs?: Map<string, string>;
  children: TreeNode[];
  shadow?: TreeNode;
  /** The host of a shadow root — the link `claim`/`state` travel over (SDD-15 §3.3). */
  host?: TreeNode;
  text?: string;
  /** A comment — the anchor a layout leaves behind a construct of its body (SDD-48 §4.3). */
  comment?: string;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

/** A class change on a fake node, as `SsrDom` makes it: no token left, no attribute. */
function applyClass(node: TreeNode, diff: ClassDiff): void {
  const tokens = classTokens(node.attrs!.get('class') ?? '').filter((token) => !diff.remove.includes(token));
  for (const token of diff.add) if (!tokens.includes(token)) tokens.push(token);
  if (tokens.length === 0) node.attrs!.delete('class');
  else node.attrs!.set('class', tokens.join(' '));
}

/** An element's start tag, as the real serializer yields it: its first piece. */
function startTag(node: TreeNode): string {
  const attrs = node.attrs ? [...node.attrs].map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('') : '';
  return `<${node.tag}${attrs}>`;
}

function serializeNode(node: TreeNode): string {
  if (node.text !== undefined) return escapeHtml(node.text);
  if (node.comment !== undefined) return `<!--${node.comment}-->`;
  const shadow = node.shadow
    ? `<template shadowrootmode="open">${node.shadow.children.map(serializeNode).join('')}</template>`
    : '';
  const light = node.children.map(serializeNode).join('');
  return `${startTag(node)}${shadow}${light}</${node.tag}>`;
}

export function minimalSsr(): {
  createDom: () => Record<string, (...a: unknown[]) => unknown>;
  serialize: (root: unknown) => Iterable<string>;
  escapeText: (s: string) => string;
  escapeAttr: (s: string) => string;
  jsonBlock: typeof jsonBlock;
  packData: typeof packData;
} {
  const createDom = () => {
    // The instance collector, in the same shape `SsrDom` implements it: one counter for the
    // id and the slice, so the two cannot come apart (SDD-15 §3.3).
    const ids = new Map<TreeNode, number>();
    const slices: (readonly unknown[])[] = [];
    return {
      element: (tag: unknown): TreeNode => ({ tag: String(tag), attrs: new Map(), children: [] }),
      text: (s: unknown): TreeNode => ({ text: String(s), children: [] }),
      comment: (s: unknown): TreeNode => ({ comment: String(s), children: [] }),
      setAttr: (n: unknown, k: unknown, v: unknown): void => {
        (n as TreeNode).attrs!.set(String(k), String(v));
      },
      // The class list as `SsrDom` keeps it: the attribute itself, token by token (SDD-85 §4.5).
      toggleClass: (n: unknown, token: unknown, on: unknown): void => {
        const t = String(token);
        applyClass(n as TreeNode, on === true ? { remove: [], add: [t] } : { remove: [t], add: [] });
      },
      swapClass: (n: unknown, next: unknown, prev: unknown): void => {
        applyClass(n as TreeNode, classDiff(next, prev));
      },
      append: (p: unknown, c: unknown): void => {
        (p as TreeNode).children.push(c as TreeNode);
      },
      attachShadow: (n: unknown): TreeNode => {
        const sr: TreeNode = { children: [], host: n as TreeNode };
        (n as TreeNode).shadow = sr;
        return sr;
      },
      // No guards here, and that is the difference between a fake and the adapter: a page
      // render claims each host exactly once and only ever calls `state` for a host that
      // was claimed. The defensive branches — a second claim, a shadow with no id — are
      // real cases of `SsrDom` and are tested there.
      claim: (n: unknown): void => {
        const host = n as TreeNode;
        ids.set(host, slices.length);
        host.attrs!.set('data-fud-id', String(slices.length));
        slices.push([]);
      },
      state: (sr: unknown, values: unknown): void => {
        slices[ids.get((sr as TreeNode).host!)!] = [...(values as readonly unknown[])];
      },
      // The route's door into the same slice: it holds the `<body>` itself, not a shadow
      // that leads to it (SDD-39 §3.2).
      stateOf: (host: unknown, values: unknown): void => {
        slices[ids.get(host as TreeNode)!] = [...(values as readonly unknown[])];
      },
      hydrationState: (): { offsets: number[]; data: unknown[] } => {
        const offsets = [0];
        const data: unknown[] = [];
        for (const slice of slices) {
          data.push(...slice);
          offsets.push(data.length);
        }
        return { offsets, data };
      },
    };
  };
  return {
    createDom: createDom as unknown as () => Record<string, (...a: unknown[]) => unknown>,
    // A generator-shaped serialize — `page` yields* it, streaming a trozos — whose first piece
    // is the start tag, as the real one: the shell's opening tag is read from it (SDD-40 §4.4).
    serialize: (root: unknown) => {
      const html = serializeNode(root as TreeNode);
      const start = startTag(root as TreeNode);
      return [start, html.slice(start.length)];
    },
    escapeText: escapeHtml,
    escapeAttr,
    jsonBlock,
    packData,
  };
}

/**
 * Emit every module of a graph to a temp dir, import the page and RUN it: the real
 * document, produced the way `build.ts` produces one.
 *
 * It has to go through the filesystem — the page module imports its components by
 * specifier, so there is no evaluating it in isolation. Shared because two suites need
 * the rendered HTML and not the emitted source: the codegen tests, and BUG-07, whose
 * whole subject is the bytes of the document.
 */
export type PageFn = (data: unknown, io: unknown) => Pieces;

/** What a `page`/`layout` yields: sync or async, strings plus the odd non-string marker (`FLUSH`). */
export type Pieces = Iterable<unknown> | AsyncIterable<unknown>;

/** Drain a `page`/`layout` stream into the document, skipping every non-string piece. */
export async function drain(pieces: Pieces): Promise<string> {
  let html = '';
  for await (const piece of pieces) if (typeof piece === 'string') html += piece;
  return html;
}

/**
 * The smallest layout (SDD-88): a document that renders the route's head and body and adds
 * nothing. A test about something other than the layout links it, so the `<body>` it paints is
 * the route's markup and nothing else.
 */
export const BARE_LAYOUT =
  '<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n';

/** Where {@link withLayout} puts {@link BARE_LAYOUT}, and the `href` a route at the root links. */
export const BARE_LAYOUT_PATH = '/_layout.fud';

/** The first line of a route at the root that links {@link BARE_LAYOUT}. */
export const LINK_LAYOUT = '<link rel="layout" href="./_layout.fud">\n';

/** `files` plus {@link BARE_LAYOUT} at {@link BARE_LAYOUT_PATH}, for `memoryIo`. */
export function withLayout(files: Record<string, string>, layout: string = BARE_LAYOUT): Record<string, string> {
  return { [BARE_LAYOUT_PATH]: layout, ...files };
}

/**
 * Emit every module of a route's graph (its layout and its components) to a temp dir and import
 * the route's `page(data, io)`. Every page links a layout since SDD-88: resolve it with
 * `resolveDocument`, and give it a layout ({@link BARE_LAYOUT} when the test is not about one).
 *
 * `options` go to EVERY module and not just the page, because a component renders its
 * children's hosts and those hosts carry the adopted list too (SDD-42 §4.1). Emitting the
 * page with a project guide and its components without one would produce a document whose
 * two halves disagree, which is a state the build cannot reach.
 */
export async function pageModuleOf(
  graph: DocumentGraph,
  options: EmitOptions = {},
): Promise<PageFn> {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-emit-'));
  mkdirSync(dir, { recursive: true });
  for (const comp of graph.components.values()) {
    writeFileSync(join(dir, `${comp.tag}.mjs`), emitComponentModule(graph, comp, options), 'utf8');
  }
  if (graph.layouts.length === 0) throw new Error(`${graph.entryPath} links no layout: every page links one (SDD-88)`);
  for (const layout of graph.layouts) {
    const stem = (layout.path.split(/[\\/]/u).pop() ?? layout.path).replace(/\.[^.]+$/u, '');
    writeFileSync(join(dir, `${stem}.mjs`), emitLayoutModule(graph, layout, options), 'utf8');
  }
  writeFileSync(join(dir, 'home.mjs'), emitRouteModule(graph, options), 'utf8');
  const mod = (await import(pathToFileURL(join(dir, 'home.mjs')).href)) as { page: PageFn };
  return mod.page;
}

export async function renderPageHtml(graph: DocumentGraph, data: unknown): Promise<string> {
  const page = await pageModuleOf(graph);
  // `page` streams a trozos: join the pieces into the full document (SDD-19 §4.3).
  return drain(page(data, minimalSsr()));
}

/**
 * The REAL `@fudic/ssr` as `io`, with the adapter kept so a test can read the payload the
 * render collected. `minimalSsr` cannot answer that question honestly: `script` is rawtext
 * for the real serializer and escaped text for the fake one, and the JSON blocks live or
 * die on exactly that difference.
 */
export function ssrIo(): { io: unknown; dom: () => SsrDom } {
  let built: SsrDom | undefined;
  return {
    io: {
      createDom: (): SsrDom => {
        built = new SsrDom();
        return built;
      },
      serialize: serializeChunks,
      escapeText,
      escapeAttr,
      jsonBlock,
      packData,
    },
    dom: () => built!,
  };
}

/**
 * Evaluate an emitted COMPONENT module that has NO ES imports (a leaf like app-badge),
 * returning its exports. Strips the `export` keywords and evaluates in a function scope
 * so the render function can be run against a recording dom.
 */
export function evalLeafModule(moduleSource: string): {
  tag: string;
  css: string;
  render: (dom: unknown, shadow: unknown, props: unknown) => void;
} {
  if (/^\s*import\s/mu.test(moduleSource)) {
    throw new Error('evalLeafModule is only for modules without imports');
  }
  const body = moduleSource.replace(/^export\s+/gmu, '') + '\nreturn { tag, css, render };';
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(body)() as ReturnType<typeof evalLeafModule>;
}

/**
 * The props without their span, for a `toEqual` whose subject is the CHANNEL and the `?`.
 *
 * `Prop.at` arrived with SDD-40, where a diagnostic needs somewhere to land. A suite that
 * asks what `props<T>()` declared should not have to spell out four offsets to say that a
 * prop crosses by value — and it should not fall back to `toMatchObject` either, because an
 * absent `channel` is exactly what half of those assertions are about.
 */
export function bareProps(props: readonly Prop[]): readonly Omit<Prop, 'at'>[] {
  return props.map(({ at: _at, ...rest }) => rest);
}

/**
 * The reactives without their offsets, for a `toEqual` whose subject is the name, the
 * initial and the kind. The same bargain `bareProps` makes, and for the same reason.
 */
export function bareSignals(
  signals: readonly Reactive[],
): readonly Omit<Reactive, 'at' | 'span'>[] {
  return signals.map(({ at: _at, span: _span, ...rest }) => rest);
}
