/**
 * `view-attributes` (SDD-51 §3.8): the attributes that run, load or redirect without passing
 * through the URL guard, and the properties that write HTML.
 *
 * - `FUD0915` — a `javascript:` (or `vbscript:`, or a `data:` that is not an image) written
 *   literally in a URL attribute, any `srcdoc`, a `<meta http-equiv="refresh">`, a `<base>`
 *   whose `href` is dynamic, an `<animate>`/`<set>` aimed at an `href`, and a dynamic `style`.
 *   The literal `javascript:` is dead under fudic's CSP for the same reason an `onclick` is
 *   (decision 139); the others are documents and redirects the guard never sees.
 * - `FUD0916` — `.innerHTML`, `.outerHTML` and `.srcdoc`: a string turned into markup.
 * - `FUD0909` — `.onclick` on a NATIVE tag: a handler set as a property is not blocked by the
 *   CSP, and `@click` already exists. On a component, `.onSave` stays a prop (decision 41.c).
 */

import { FUD0909, FUD0915, FUD0916 } from '@fudic/diagnostics';
import { decodeEntities, type Attribute } from '../../html/index.js';
import { isUrlAttr } from '../../emit/attrs.js';
import { span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { isNativeEventAttribute } from '../html-events.js';
import { documentRoots, walk } from '../walk.js';

/** The properties that parse their value as HTML. */
const HTML_PROPERTIES: ReadonlySet<string> = new Set(['innerhtml', 'outerhtml', 'srcdoc']);
/** The SVG animation elements that can rewrite another attribute of their parent. */
const ANIMATIONS: ReadonlySet<string> = new Set(['animate', 'set', 'animatemotion', 'animatetransform']);

/** The literal text of an attribute, entities decoded; `undefined` when a part is dynamic. */
function literal(attr: Attribute): string | undefined {
  let text = '';
  for (const part of attr.value) {
    if (part.type !== 'attribute-text') return undefined;
    text += decodeEntities(part.value);
  }
  return text;
}

/** Whether a literal URL opens with a scheme that runs script or embeds a document. */
function scripted(url: string, tag: string, name: string): boolean {
  // What a browser drops before it reads a scheme (the guard does the same, §3.7).
  const text = url.replace(/[\t\n\r]/gu, '').replace(/^[\x00-\x20]+/u, '').toLowerCase();
  if (text.startsWith('javascript:') || text.startsWith('vbscript:')) return true;
  return text.startsWith('data:') && !(tag === 'img' && name === 'src' && text.startsWith('data:image/'));
}

/** Whether the attribute is one of the FUD0915 cases. */
function runs(tag: string, name: string, attr: Attribute): boolean {
  const text = literal(attr);
  if (name === 'srcdoc') return true;
  if (name === 'style') return text === undefined;
  if (tag === 'meta' && name === 'http-equiv') return text?.trim().toLowerCase() === 'refresh';
  if (tag === 'base' && name === 'href') return text === undefined;
  if (ANIMATIONS.has(tag) && name === 'attributename') return /^(xlink:)?href$/iu.test(text?.trim() ?? '');
  return text !== undefined && (isUrlAttr(tag, name) || name === 'codebase') && scripted(text, tag, name);
}

export const viewAttributes: Analyzer = {
  name: 'view-attributes',
  run(input, report) {
    walk(documentRoots(input.document), {
      element(el) {
        const tag = el.name.toLowerCase();
        for (const attr of el.attributes) {
          if (typeof attr.name !== 'string') continue;
          const at = { span: span(attr.span.start, attr.span.start + attr.name.length) };
          const name = attr.name.toLowerCase();
          if (name.startsWith('.')) {
            const property = name.slice(1);
            if (HTML_PROPERTIES.has(property)) report(FUD0916(at));
            else if (!tag.includes('-') && isNativeEventAttribute(property)) report(FUD0909(at));
          } else if (runs(tag, name, attr)) {
            report(FUD0915(at));
          }
        }
      },
    });
  },
};
