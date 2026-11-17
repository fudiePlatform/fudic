/**
 * The template of a piece of view (SDD-85 §4.1): the HTML the server would paint for it with
 * every value empty and every block closed, which is what the browser clones to create it.
 *
 * It is written by the same walk that writes the adoption (`markup-client.ts`), one call per fact
 * of the tree, and serialized here with the server's own rules: its escaping (`@fudic/dom`), its
 * void elements, its raw text. A template that serialized differently would be a created tree
 * the adoption does not recognise.
 *
 * Nothing dynamic is ever written into it: a value goes in afterwards, as text, attribute or
 * class, through the DOM.
 */

import { escapeAttr, escapeText } from '@fudic/dom';
import { VOID_ELEMENTS } from '../html/index.js';
import { here, type CodeWriter } from './writer.js';

/** The namespace the parser creates an element in: what a template's wrapper has to restore. */
export type Namespace = 'html' | 'svg' | 'math';

/** Elements whose text the server writes verbatim, as the parser reads it back. */
const RAWTEXT: ReadonlySet<string> = new Set(['script', 'style']);

/** The SVG elements whose children the parser creates as HTML: its HTML integration points. */
const SVG_HTML: ReadonlySet<string> = new Set(['foreignobject', 'desc', 'title']);

/** The MathML text integration points: their children are HTML too. */
const MATH_HTML: ReadonlySet<string> = new Set(['mi', 'mo', 'mn', 'ms', 'mtext']);

/** The namespace of an element with `tag`, written in a level whose namespace is `level`. */
export function elementNamespace(level: Namespace, tag: string): Namespace {
  const name = tag.toLowerCase();
  if (name === 'svg') return 'svg';
  if (level === 'html' && name === 'math') return 'math';
  return level;
}

/** The namespace of the level inside an element of namespace `ns` with `tag`. */
export function childrenNamespace(ns: Namespace, tag: string): Namespace {
  const name = tag.toLowerCase();
  if (ns === 'svg' && SVG_HTML.has(name)) return 'html';
  if (ns === 'math' && MATH_HTML.has(name)) return 'html';
  return ns;
}

/** The HTML of one template, written element by element as the walk reaches each fact. */
export class TemplateHtml {
  /** The namespace of the level the template's roots sit in. */
  readonly ns: Namespace;
  #out = '';
  /** The start tag still open for attributes: written the moment anything else arrives. */
  #pending: { readonly tag: string; readonly attrs: Map<string, string> } | null = null;
  /** The elements open around what is written now, innermost last. */
  readonly #open: string[] = [];

  constructor(ns: Namespace) {
    this.ns = ns;
  }

  /** An element starts: its attributes follow, then its content, then `close`. */
  open(tag: string): void {
    this.#flush();
    this.#pending = { tag, attrs: new Map() };
  }

  /**
   * A literal attribute of the element just opened. Set twice, it keeps its first place and its
   * last value, as `setAttr` does on the server.
   */
  attr(name: string, value: string): void {
    this.#pending!.attrs.set(name, value);
  }

  /** Text: escaped, or verbatim inside a `<script>` or a `<style>`. Empty text is no node. */
  text(data: string): void {
    if (data === '') return;
    this.#flush();
    const parent = this.#open.at(-1);
    this.#out += parent !== undefined && RAWTEXT.has(parent.toLowerCase()) ? data : escapeText(data);
  }

  /** The empty comment that separates two interpolated runs (SDD-30 §3.4). */
  comment(): void {
    this.#flush();
    this.#out += '<!---->';
  }

  /** The element opened last ends. A void element has no end tag. */
  close(): void {
    this.#flush();
    const tag = this.#open.pop()!;
    if (!VOID_ELEMENTS.has(tag.toLowerCase())) this.#out += `</${tag}>`;
  }

  /** The HTML written so far. */
  get html(): string {
    return this.#out;
  }

  #flush(): void {
    if (this.#pending === null) return;
    const { tag, attrs } = this.#pending;
    let start = `<${tag}`;
    for (const [name, value] of attrs) start += ` ${name}="${escapeAttr(value)}"`;
    this.#out += `${start}>`;
    this.#open.push(tag);
    this.#pending = null;
  }
}

/** The wrapper a template of a foreign level is parsed in, so its nodes get their namespace. */
const WRAPPER: Readonly<Record<Exclude<Namespace, 'html'>, string>> = { svg: 'svg', math: 'math' };

/**
 * The body of a JS template literal that cooks back to `text`: `\`, `` ` `` and `${` escaped,
 * and nothing else touched.
 */
export function literalBody(text: string): string {
  return text.replace(/[\\`]|\$\{/gu, (found) => `\\${found}`);
}

/**
 * The templates of one module, each one a constant at module level (SDD-85 §4.1). Two pieces of
 * view with the same HTML in the same namespace share one: the clone is the same.
 */
export class Templates {
  readonly #names = new Map<string, string>();
  readonly #lines: { readonly text: string; readonly at: number }[] = [];
  #foreign = false;
  #plain = false;
  #selects = false;

  /**
   * The module creates a `<select>` whose value it writes: its clone gets its default from
   * `selectDefault`, which comes in on the same import as the templates (SDD-85 decision 42).
   */
  createsSelect(): void {
    this.#selects = true;
  }

  /**
   * The constant a template is cloned from, or `null` when it has nothing to clone: a piece of
   * view with no node of its own creates everything it holds after the clone.
   */
  add(template: TemplateHtml, at: number): string | null {
    if (template.html === '') return null;
    const wrapper = template.ns === 'html' ? undefined : WRAPPER[template.ns];
    const tag = wrapper === undefined ? '$template' : '$templateIn';
    const body = wrapper === undefined ? template.html : `<${wrapper}>${template.html}</${wrapper}>`;
    const literal = `${tag}\`${literalBody(body)}\``;
    const known = this.#names.get(literal);
    if (known !== undefined) return known;
    const name = `$T${this.#names.size}`;
    this.#names.set(literal, name);
    this.#lines.push({ text: `const ${name} = ${literal};`, at });
    if (wrapper === undefined) this.#plain = true;
    else this.#foreign = true;
    return name;
  }

  /**
   * The `import` of what the declarations call, or `null` when there is none. Under `$` names, the
   * emit's reserve: an author's own `template` at the top of the module is not a collision.
   */
  get importLine(): string | null {
    const names = [
      ...(this.#plain ? ['template as $template'] : []),
      ...(this.#foreign ? ['templateIn as $templateIn'] : []),
      ...(this.#selects ? ['selectDefault as $selectDefault'] : []),
    ];
    return names.length === 0 ? null : `import { ${names.join(', ')} } from '@fudic/dom';`;
  }

  /** Whether the module declares no template, and so parses no HTML through the policy (SDD-85 §4.7). */
  get empty(): boolean {
    return this.#lines.length === 0;
  }

  /**
   * One `const $TN = template\`…\`;` per template, in the order they were added, with where its
   * piece starts in the `.fud`, which the source map points at.
   */
  get declarations(): readonly { readonly text: string; readonly at: number }[] {
    return this.#lines;
  }
}

/**
 * The templates of a module, at its top: the import of what they call, last among the imports,
 * and one constant each. Lazy, so a module whose templates are never cloned parses nothing.
 */
export function writeTemplates(w: CodeWriter, templates: Templates): void {
  const line = templates.importLine;
  if (line === null) return;
  w.line(line);
  // Each one mapped to where its piece starts in the `.fud`.
  for (const { text, at } of templates.declarations) w.mappedLine(here(at), text);
}
