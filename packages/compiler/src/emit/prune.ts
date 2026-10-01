/**
 * The CSS each page uses (SDD-49 §3.5, §4.4–§4.7).
 *
 * Every sheet a page receives is pruned twice over.
 *
 * Its RULES against the surface of the scope it applies to: a rule stays when some selector of
 * it can match some element there, and goes when none can. The error has one direction — a rule
 * may stay that nothing needs, a rule somebody needs never goes — so every doubt keeps: a
 * selector this module does not understand, a class written from an expression, a value that is
 * not literal.
 *
 * Its TOKENS against the whole page. Custom properties are inherited, so they are the one thing
 * that crosses the shadow boundary: a token of the document's `:root` is read from inside a
 * component's `<style>`. A token lives while some live text names it — a kept declaration of any
 * sheet, a component's `<style>`, a `style=` of the markup — and a live token's value is live
 * text too, so `--btn: var(--blue)` keeps `--blue` alive. `@keyframes` and `@font-face` are
 * decided in the same fixed point, because a token's value can name them; `@property` lives with
 * its token.
 *
 * It only REMOVES. What stays is the text the author wrote, in the order they wrote it, and the
 * result goes through `compactProjectCss` like any other sheet of the framework. With a surface
 * and a use that hold everything nothing is removed, and the output is the compacted input byte
 * for byte.
 */

import type { Diagnostic, ParseResult, Span } from '../types/index.js';
import { ok, span } from '../types/index.js';
import { FUD0854 } from '@fudic/diagnostics';
import {
  originOf,
  parseCssRules,
  parseSelectorList,
  type BlockAtRule,
  type ComplexSelector,
  type CompoundSelector,
  type CssRule,
  type FileDiagnostic,
  type FlatSheet,
  type StyleRule,
} from '../css/index.js';
import { splitSelectorList } from '../css/selectors.js';
import type { AttributeSelector } from '../css/selectors.js';
import { compactProjectCss } from './project-styles.js';
import type { ScopeSurface, StyleScope } from './surface.js';

export interface PageSheet {
  readonly key: string;
  /** A project sheet is a `FlatSheet` of one region (`plainSheet`). */
  readonly sheet: FlatSheet;
  readonly scope: StyleScope;
  readonly surface: ScopeSurface;
}

export interface PrunedSheet {
  readonly key: string;
  /** Compacted (`compactProjectCss`). `''` when no rule is left. */
  readonly css: string;
  /** The files of the flattened sheet that keep at least one rule on this page (§4.11). */
  readonly contributing: readonly string[];
}

/** The at-rules whose block holds rules, pruned from the inside. */
const GROUPING = new Set([
  'media',
  'supports',
  'container',
  'layer',
  'scope',
  'starting-style',
  'document',
  '-moz-document',
]);
const KEYFRAMES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes']);
/** Statements that say nothing about an element: a sheet of only these is an empty sheet. */
const INERT = new Set(['charset', 'layer', 'namespace']);

// ---------------------------------------------------------------------------
// Selectors against a surface
// ---------------------------------------------------------------------------

function attributeMatches(want: AttributeSelector, surface: ScopeSurface): boolean {
  if (!surface.attributes.has(want.name)) return false;
  if (want.value === undefined || want.operator === undefined) return true;
  const values = surface.attributes.get(want.name);
  if (values === null || values === undefined) return true;
  const v = want.value;
  for (const seen of values) {
    switch (want.operator) {
      case '=':
        if (seen === v) return true;
        break;
      case '~=':
        if (seen.split(/\s+/u).includes(v)) return true;
        break;
      case '|=':
        if (seen === v || seen.startsWith(`${v}-`)) return true;
        break;
      case '^=':
        if (v !== '' && seen.startsWith(v)) return true;
        break;
      case '$=':
        if (v !== '' && seen.endsWith(v)) return true;
        break;
      case '*=':
        if (v !== '' && seen.includes(v)) return true;
        break;
    }
  }
  return false;
}

/** Whether one compound can match some element of the surface. */
function compoundMatches(c: CompoundSelector, scope: StyleScope, surface: ScopeSurface): boolean {
  const root = c.pseudo.includes('root') || c.type === 'html' || c.type === 'body';
  // `:root`, `html` and `body` are the document's, always there — and never a shadow root's.
  if (root) return scope === 'document';
  if (c.pseudo.includes('host') || c.pseudo.includes('host-context')) return scope === 'shadow';
  if (c.slotted !== undefined) {
    if (scope !== 'shadow' || surface.slotted === null) return false;
    if (!complexMatches(c.slotted, scope, surface.slotted)) return false;
  }
  if (c.part !== undefined && surface.parts !== 'any') {
    const exposed = surface.parts;
    if (!c.part.split(/\s+/u).every((p) => exposed.has(p))) return false;
  }
  if (c.type !== undefined && !surface.tags.has(c.type)) return false;
  // `::placeholder` exists only on a text field: without one in the scope, nothing to match.
  if (c.pseudo.includes('placeholder') && !surface.tags.has('input') && !surface.tags.has('textarea')) {
    return false;
  }
  if (!surface.openClasses && !c.classes.every((k) => surface.classes.has(k))) return false;
  if (!surface.openIds && !c.ids.every((i) => surface.ids.has(i))) return false;
  if (!c.attributes.every((a) => attributeMatches(a, surface))) return false;
  return c.anyOf.every((list) => list.some((s) => complexMatches(s, scope, surface)));
}

/**
 * Whether a selector can match: EACH of its compounds matches SOME element. The structure of
 * the combinators is not checked — `ul > li` stays with a `ul` and a `li` anywhere (§7).
 */
function complexMatches(s: ComplexSelector, scope: StyleScope, surface: ScopeSurface): boolean {
  return s.compounds.every((c) => compoundMatches(c, scope, surface));
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Where an identifier appears on its own in `text`, not as part of a longer name. */
function namesIdentifier(text: string, name: string, flags = 'u'): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(^|[^\\w-])${escaped}($|[^\\w-])`, flags).test(text);
}

/** Every custom property name `text` mentions, outside its comments. */
function tokensIn(text: string): string[] {
  const bare = text.replace(/\/\*[\s\S]*?\*\//gu, ' ');
  return [...bare.matchAll(/(?<![\w-])--[\w\-\u0080-￿]+/gu)].map((m) => m[0]);
}

/** The name a `@keyframes` prelude declares: an identifier or a string. */
function keyframesName(prelude: string): string {
  return prelude.trim().replace(/^(['"])(.*)\1$/su, '$2');
}

/** The family a `@font-face` declares, or `null` when its body names none. */
function fontFamily(body: string): string | null {
  const m = /font-family\s*:\s*([^;]+)/iu.exec(body);
  if (m === null) return null;
  return m[1]!.trim().replace(/^(['"])(.*)\1$/su, '$2');
}

// ---------------------------------------------------------------------------
// The first pass: rules, and what they say
// ---------------------------------------------------------------------------

/**
 * What the whole page says: the live text the fixed point starts from, and the things it can
 * bring to life — every token's definitions, every animation, every font.
 */
class PageText {
  readonly live: string[] = [];
  readonly definitions = new Map<string, string[]>();
  readonly keyframes = new Map<string, string[]>();
  readonly fonts = new Map<string, string[]>();

  define(name: string, value: string): void {
    const seen = this.definitions.get(name);
    if (seen === undefined) this.definitions.set(name, [value]);
    else seen.push(value);
  }

  keyframe(name: string, body: string): void {
    const seen = this.keyframes.get(name);
    if (seen === undefined) this.keyframes.set(name, [body]);
    else seen.push(body);
  }

  font(family: string, body: string): void {
    const key = family.toLowerCase();
    const seen = this.fonts.get(key);
    if (seen === undefined) this.fonts.set(key, [body]);
    else seen.push(body);
  }

  /** The fixed point (§4.6): what is alive once nothing more comes to life. */
  solve(): Alive {
    const tokens = new Set<string>();
    const keyframes = new Set<string>();
    const fonts = new Set<string>();
    const queue = [...this.live];
    while (queue.length > 0) {
      const chunk = queue.pop()!;
      for (const token of tokensIn(chunk)) {
        if (tokens.has(token)) continue;
        tokens.add(token);
        queue.push(...(this.definitions.get(token) ?? []));
      }
      for (const [name, bodies] of this.keyframes) {
        if (keyframes.has(name) || !namesIdentifier(chunk, name)) continue;
        keyframes.add(name);
        queue.push(...bodies);
      }
      for (const [family, bodies] of this.fonts) {
        if (fonts.has(family) || !namesIdentifier(chunk, family, 'iu')) continue;
        fonts.add(family);
        queue.push(...bodies);
      }
    }
    return { tokens, keyframes, fonts };
  }
}

interface Alive {
  readonly tokens: ReadonlySet<string>;
  readonly keyframes: ReadonlySet<string>;
  /** Lower case. */
  readonly fonts: ReadonlySet<string>;
}

/** What the first pass decided about one sheet. */
interface SheetPlan {
  readonly sheet: PageSheet;
  /** The rule tree, or `null` for a sheet that could not be read and arrives whole. */
  readonly rules: readonly CssRule[] | null;
  /** Style rules that go. */
  readonly dropped: Set<StyleRule>;
  /** Style rules that stay with fewer selectors: the new prelude. */
  readonly trimmed: Map<StyleRule, string>;
}

/** The first pass over one sheet: which style rules stay, and what the kept ones say. */
class StylePass {
  readonly #sheet: PageSheet;
  readonly #page: PageText;
  readonly dropped = new Set<StyleRule>();
  readonly trimmed = new Map<StyleRule, string>();

  constructor(sheet: PageSheet, page: PageText) {
    this.#sheet = sheet;
    this.#page = page;
  }

  #text(sp: Span): string {
    return this.#sheet.sheet.css.slice(sp.start, sp.end);
  }

  rules(rules: readonly CssRule[], nested: boolean): void {
    for (const rule of rules) {
      if (rule.type === 'style-rule') this.#style(rule);
      else if (rule.type === 'at-block') this.#block(rule, nested);
    }
  }

  #block(rule: BlockAtRule, nested: boolean): void {
    if (rule.children !== undefined) {
      // A container query can ask about a token: `@container style(--x: y)`.
      this.#page.live.push(this.#text(rule.prelude));
      // Inside a style rule a grouping block holds the parent's own declarations, which the
      // rule tree does not list: all of it counts as said.
      if (nested) this.#page.live.push(this.#text(rule.body));
      this.rules(rule.children, nested);
      return;
    }
    const body = this.#text(rule.body);
    if (KEYFRAMES.has(rule.name)) {
      this.#page.keyframe(keyframesName(this.#text(rule.prelude)), body);
    } else if (rule.name === 'font-face') {
      const family = fontFamily(body);
      if (family === null) this.#page.live.push(body);
      else this.#page.font(family, body);
    } else if (rule.name !== 'property') {
      // `@page`, `@counter-style`, an unknown at-rule: kept, so what it says is said.
      this.#page.live.push(body);
    }
  }

  #style(rule: StyleRule): void {
    const prelude = this.#text(rule.prelude);
    const selectors = parseSelectorList(prelude);
    const parts = splitSelectorList(prelude);
    // Not understood — or understood differently from how it splits — and it stays whole.
    if (selectors !== null && parts !== null && parts.length === selectors.length) {
      const { scope, surface } = this.#sheet;
      const kept = parts.filter((_, i) => complexMatches(selectors[i]!, scope, surface));
      if (kept.length === 0) {
        this.dropped.add(rule);
        return;
      }
      if (kept.length < parts.length) this.trimmed.set(rule, kept.map((p) => p.trim()).join(','));
    }
    for (const decl of rule.declarations) {
      const value = this.#text(decl.value);
      if (decl.name.startsWith('--')) this.#page.define(decl.name, value);
      else this.#page.live.push(value);
    }
    this.rules(rule.children, true);
  }
}

// ---------------------------------------------------------------------------
// The second pass: the edits
// ---------------------------------------------------------------------------

/** A change to the source text: `[start, end)` becomes `text`. */
interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** The second pass over one sheet: the edits, and the files that keep a rule. */
class RenderPass {
  readonly #plan: SheetPlan;
  readonly #alive: Alive;
  readonly edits: Edit[] = [];
  readonly contributing = new Set<string>();

  constructor(plan: SheetPlan, alive: Alive) {
    this.#plan = plan;
    this.#alive = alive;
  }

  get #css(): string {
    return this.#plan.sheet.sheet.css;
  }

  #text(sp: Span): string {
    return this.#css.slice(sp.start, sp.end);
  }

  #drop(rule: CssRule): void {
    this.edits.push({ start: rule.span.start, end: rule.span.end, text: '' });
  }

  #contributes(rule: CssRule): void {
    this.contributing.add(originOf(this.#plan.sheet.sheet, rule.span.start).file);
  }

  /**
   * The kept rules of a list that count as content — every one but an inert statement. A
   * rule that goes is recorded as an edit and not counted.
   */
  rules(rules: readonly CssRule[], nested: boolean): number {
    let kept = 0;
    for (const rule of rules) {
      if (this.#rule(rule, nested)) {
        if (!(rule.type === 'at-statement' && INERT.has(rule.name))) kept += 1;
      } else {
        this.#drop(rule);
      }
    }
    return kept;
  }

  /** Whether one rule stays. */
  #rule(rule: CssRule, nested: boolean): boolean {
    if (rule.type === 'at-statement') {
      // What is left of `@import` in a document sheet cannot be flattened, and stays; in an
      // adopted sheet it is an error (`FUD0854`), and goes.
      if (rule.name === 'import' && this.#plan.sheet.scope === 'shadow') return false;
      if (!INERT.has(rule.name)) this.#contributes(rule);
      return true;
    }
    if (rule.type === 'style-rule') return this.#style(rule);
    if (rule.children !== undefined && GROUPING.has(rule.name)) {
      const kept = this.rules(rule.children, nested);
      // Inside a style rule it holds the parent's own declarations too, which are not rules:
      // it stays with its parent whatever its nested rules do.
      return nested || kept > 0;
    }
    const stays = this.#leaf(rule);
    if (stays) this.#contributes(rule);
    return stays;
  }

  #leaf(rule: BlockAtRule): boolean {
    if (KEYFRAMES.has(rule.name)) {
      return this.#alive.keyframes.has(keyframesName(this.#text(rule.prelude)));
    }
    if (rule.name === 'font-face') {
      const family = fontFamily(this.#text(rule.body));
      return family === null || this.#alive.fonts.has(family.toLowerCase());
    }
    if (rule.name === 'property') return this.#alive.tokens.has(this.#text(rule.prelude).trim());
    // `@page`, `@counter-style`, `@font-feature-values`, any unknown at-rule.
    return true;
  }

  #style(rule: StyleRule): boolean {
    if (this.#plan.dropped.has(rule)) return false;
    let declarations = 0;
    for (const decl of rule.declarations) {
      if (decl.name.startsWith('--') && !this.#alive.tokens.has(decl.name)) {
        this.edits.push({ start: decl.span.start, end: this.#pastSemicolon(decl.span.end), text: '' });
      } else {
        declarations += 1;
      }
    }
    const children = this.rules(rule.children, true);
    if (declarations === 0 && children === 0) return false;
    const prelude = this.#plan.trimmed.get(rule);
    if (prelude !== undefined) this.edits.push({ ...rule.prelude, text: prelude });
    if (declarations > 0) this.#contributes(rule);
    return true;
  }

  /** `at`, or past the `;` that ends the declaration ending at `at`. */
  #pastSemicolon(at: number): number {
    let i = at;
    while (i < this.#css.length && /\s/u.test(this.#css[i]!)) i += 1;
    return this.#css[i] === ';' ? i + 1 : at;
  }
}

/**
 * `css` with its edits applied, in order; an edit inside a removed span is moot. No two edits
 * start at the same offset: a dropped rule starts at the rule, a dead declaration inside its
 * body, and a trimmed prelude is only written for a rule that stays.
 */
function applyEdits(css: string, edits: readonly Edit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = '';
  let at = 0;
  for (const edit of sorted) {
    if (edit.start < at) continue;
    out += css.slice(at, edit.start) + edit.text;
    at = edit.end;
  }
  return out + css.slice(at);
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/**
 * All the sheets of ONE page at once: tokens, `@keyframes`, `@font-face` and `@property` are
 * decided looking at what is kept in all of them and at `consumers` — the CSS of the page that
 * is never pruned but reads tokens: each component's `<style>`, each `style=` (§4.6).
 */
export function prunePage(
  sheets: readonly PageSheet[],
  consumers: readonly string[],
): ParseResult<readonly PrunedSheet[]> {
  const page = new PageText();
  page.live.push(...consumers);
  const plans: SheetPlan[] = sheets.map((sheet) => {
    const parsed = parseCssRules(sheet.sheet.css);
    if (parsed.diagnostics.length > 0) {
      // Unreadable, so every word of it may be what names a token, a font or an animation.
      page.live.push(sheet.sheet.css);
      return { sheet, rules: null, dropped: new Set(), trimmed: new Map() };
    }
    const pass = new StylePass(sheet, page);
    pass.rules(parsed.value.rules, false);
    return { sheet, rules: parsed.value.rules, dropped: pass.dropped, trimmed: pass.trimmed };
  });
  const alive = page.solve();
  const out = plans.map((plan): PrunedSheet => {
    const { key, sheet } = plan.sheet;
    if (plan.rules === null) {
      return { key, css: compactProjectCss(sheet.css), contributing: sheet.files };
    }
    const pass = new RenderPass(plan, alive);
    const kept = pass.rules(plan.rules, false);
    const css = kept === 0 ? '' : compactProjectCss(applyEdits(sheet.css, pass.edits));
    return { key, css, contributing: [...pass.contributing] };
  });
  return ok(out);
}

/**
 * What a document sheet has to say about itself, whatever page it lands in: what the
 * flattening found (`FUD0850`, `FUD0853`, `FUD0856`–`FUD0858`) and `FUD0851` where it cannot be
 * read — each over the file it is about, so the host reports it once per file and not once per
 * page.
 */
export function sheetDiagnostics(sheet: FlatSheet): readonly FileDiagnostic[] {
  const unreadable = parseCssRules(sheet.css).diagnostics.map((d): FileDiagnostic => {
    const from = originOf(sheet, d.span.start);
    // The end is mapped through its last character: an end that falls exactly where an
    // imported file's region ends belongs to that file, not to the one written after it.
    const last = originOf(sheet, Math.max(d.span.end - 1, d.span.start));
    const end = d.span.end > d.span.start && last.file === from.file ? last.offset + 1 : from.offset;
    return { file: from.file, diagnostic: { ...d, span: span(from.offset, end) } };
  });
  return [...sheet.diagnostics, ...unreadable];
}

/** `FUD0854` on every `@import` of a `globalStyles` or `styles` sheet, over its text. */
export function projectSheetDiagnostics(css: string): readonly Diagnostic[] {
  return importsOf(parseCssRules(css).value.rules).map((r) => FUD0854({ span: r.span }));
}

/** Every `@import` of a rule list, at any depth. */
function importsOf(rules: readonly CssRule[]): readonly CssRule[] {
  return rules.flatMap((r): CssRule[] => {
    if (r.type === 'at-statement') return r.name === 'import' ? [r] : [];
    if (r.type === 'style-rule') return [...importsOf(r.children)];
    return r.children === undefined ? [] : [...importsOf(r.children)];
  });
}
