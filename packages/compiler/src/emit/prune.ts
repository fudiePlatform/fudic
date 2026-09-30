/**
 * The CSS each page uses (SDD-49 §3.4, §4.3–§4.5).
 *
 * Every sheet a page receives is pruned against the SURFACE of the scope it applies to: a
 * rule stays when some selector of it can match some element there, and goes when none can.
 * The error has one direction — a rule may stay that nothing needs, a rule somebody needs
 * never goes — so every doubt keeps: a selector this module does not understand, a class
 * written from an expression, a value that is not literal.
 *
 * It only REMOVES. What stays is the text the author wrote, in the order they wrote it, and
 * the result goes through `compactProjectCss` like any other sheet of the framework. With a
 * surface that holds everything nothing is removed, and the output is the compacted input
 * byte for byte.
 *
 * The sheets of one page are pruned TOGETHER because two kinds of rule are decided by what
 * the others keep: a `@keyframes` lives while some kept declaration names it, and a
 * `@font-face` while some kept declaration names its family — and a family the document
 * declares serves the shadow roots as well.
 */

import type { Diagnostic, ParseResult, Span } from '../types/index.js';
import { ok, warningDiag, withDiagnostics } from '../types/index.js';
import {
  parseCssRules,
  parseSelectorList,
  type BlockAtRule,
  type ComplexSelector,
  type CompoundSelector,
  type CssRule,
  type StyleRule,
} from '../css/index.js';
import { splitSelectorList } from '../css/selectors.js';
import type { AttributeSelector } from '../css/selectors.js';
import { compactProjectCss } from './project-styles.js';
import type { ScopeSurface, StyleScope } from './surface.js';

export { FUD_SHEET_UNREADABLE } from '../css/rules.js';

/** The sheet holds an `@import`: the file it imports arrives whole. */
export const FUD_SHEET_IMPORT = 'FUD0850';
/** A sheet that adds no rule to any page of the application (reported by the host). */
export const FUD_SHEET_UNUSED = 'FUD0852';

export interface PageSheet {
  readonly key: string;
  readonly css: string;
  readonly scope: StyleScope;
  readonly surface: ScopeSurface;
  /**
   * A sheet that is READ and never pruned nor reported: a component's own `<style>` (§7). What
   * it keeps still names fonts and animations the page's sheets declare — a family the
   * document's guide defines is used from inside a shadow root — so it takes part in that
   * decision, and nothing comes out for it.
   */
  readonly reference?: boolean;
}

export interface PrunedSheet {
  readonly key: string;
  /** Compacted (`compactProjectCss`). `''` when no rule is left. */
  readonly css: string;
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
// One sheet
// ---------------------------------------------------------------------------

/** A change to the source text: `[start, end)` becomes `text`. */
interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
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

/**
 * The first pass over one sheet: which style rules stay, and what their kept declarations
 * say — the text `@keyframes` and `@font-face` are decided against.
 */
class StylePass {
  readonly #sheet: PageSheet;
  readonly #referenced: string[];
  readonly dropped = new Set<StyleRule>();
  readonly trimmed = new Map<StyleRule, string>();

  constructor(sheet: PageSheet, referenced: string[]) {
    this.#sheet = sheet;
    this.#referenced = referenced;
  }

  #text(sp: Span): string {
    return this.#sheet.css.slice(sp.start, sp.end);
  }

  rules(rules: readonly CssRule[], nested: boolean): void {
    for (const rule of rules) {
      if (rule.type === 'style-rule') this.#style(rule);
      else if (rule.type === 'at-block') this.#block(rule, nested);
    }
  }

  #block(rule: BlockAtRule, nested: boolean): void {
    // Inside a style rule a grouping block holds the parent's own declarations, which the
    // rule tree does not list: all of it counts as said.
    if (nested) this.#referenced.push(this.#text(rule.body));
    if (rule.children !== undefined) this.rules(rule.children, nested);
    else if (!KEYFRAMES.has(rule.name) && rule.name !== 'font-face') {
      this.#referenced.push(this.#text(rule.body));
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
    for (const decl of rule.declarations) this.#referenced.push(this.#text(decl));
    this.rules(rule.children, true);
  }
}

/** Where an identifier appears on its own in `text`, not as part of a longer name. */
function namesIdentifier(text: string, name: string, flags = 'u'): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(^|[^\\w-])${escaped}($|[^\\w-])`, flags).test(text);
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

/** The second pass over one sheet: the edits, and whether any rule is left. */
class RenderPass {
  readonly #plan: SheetPlan;
  readonly #referenced: string;
  readonly edits: Edit[] = [];

  constructor(plan: SheetPlan, referenced: string) {
    this.#plan = plan;
    this.#referenced = referenced;
  }

  #text(sp: Span): string {
    return this.#plan.sheet.css.slice(sp.start, sp.end);
  }

  #drop(rule: CssRule): void {
    this.edits.push({ start: rule.span.start, end: rule.span.end, text: '' });
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
    if (rule.type === 'at-statement') return true;
    if (rule.type === 'style-rule') {
      if (this.#plan.dropped.has(rule)) return false;
      const prelude = this.#plan.trimmed.get(rule);
      if (prelude !== undefined) this.edits.push({ ...rule.prelude, text: prelude });
      this.rules(rule.children, true);
      return true;
    }
    if (rule.children !== undefined && GROUPING.has(rule.name)) {
      const kept = this.rules(rule.children, nested);
      // Inside a style rule it holds the parent's own declarations too, which are not rules:
      // it stays with its parent whatever its nested rules do.
      return nested || kept > 0;
    }
    if (KEYFRAMES.has(rule.name)) {
      return namesIdentifier(this.#referenced, keyframesName(this.#text(rule.prelude)));
    }
    if (rule.name === 'font-face') {
      const family = fontFamily(this.#text(rule.body));
      return family === null || namesIdentifier(this.#referenced, family, 'iu');
    }
    // `@property`, `@page`, `@counter-style`, `@font-feature-values`, any unknown at-rule.
    return true;
  }
}

/** `css` with its edits applied, outermost first; an edit inside a removed span is moot. */
function applyEdits(css: string, edits: readonly Edit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  let out = '';
  let at = 0;
  for (const edit of sorted) {
    if (edit.start < at) continue;
    out += css.slice(at, edit.start) + edit.text;
    at = edit.end;
  }
  return out + css.slice(at);
}

/** Every `@import` of a sheet, which the prune keeps and cannot follow. */
function imports(rules: readonly CssRule[]): readonly Diagnostic[] {
  return rules
    .filter((r) => r.type === 'at-statement' && r.name === 'import')
    .map((r) =>
      warningDiag(
        FUD_SHEET_IMPORT,
        'this stylesheet @imports another: the imported file is shipped whole, without pruning',
        r.span,
      ),
    );
}

/**
 * All the sheets of ONE page at once: `@keyframes`, `@font-face` and `@property` are decided
 * looking at what is kept in all of them (§4.4).
 */
export function prunePage(sheets: readonly PageSheet[]): ParseResult<readonly PrunedSheet[]> {
  const diagnostics: Diagnostic[] = [];
  const referenced: string[] = [];
  const plans: SheetPlan[] = sheets.map((sheet) => {
    const parsed = parseCssRules(sheet.css);
    if (!sheet.reference) diagnostics.push(...sheetDiagnostics(sheet.css, parsed));
    if (parsed.diagnostics.length > 0) {
      // Unreadable, so every word of it may be what names a font or an animation.
      referenced.push(sheet.css);
      return { sheet, rules: null, dropped: new Set(), trimmed: new Map() };
    }
    const pass = new StylePass(sheet, referenced);
    pass.rules(parsed.value.rules, false);
    return { sheet, rules: parsed.value.rules, dropped: pass.dropped, trimmed: pass.trimmed };
  });
  const said = referenced.join('\n');
  const out = plans.flatMap((plan): PrunedSheet[] => {
    if (plan.sheet.reference) return [];
    if (plan.rules === null) return [{ key: plan.sheet.key, css: compactProjectCss(plan.sheet.css) }];
    const pass = new RenderPass(plan, said);
    const kept = pass.rules(plan.rules, false);
    const css = kept === 0 ? '' : compactProjectCss(applyEdits(plan.sheet.css, pass.edits));
    return [{ key: plan.sheet.key, css }];
  });
  return diagnostics.length === 0 ? ok(out) : withDiagnostics(out, diagnostics);
}

/**
 * What a sheet has to say about itself, whatever page it lands in: `FUD0851` where it cannot
 * be read, `FUD0850` on each `@import`. Its spans are over the sheet's own text, so the host —
 * which knows the file — reports them, once per sheet and not once per page.
 */
export function sheetDiagnostics(
  css: string,
  parsed: ParseResult<{ readonly rules: readonly CssRule[] }> = parseCssRules(css),
): readonly Diagnostic[] {
  return [...parsed.diagnostics, ...imports(parsed.value.rules)];
}
