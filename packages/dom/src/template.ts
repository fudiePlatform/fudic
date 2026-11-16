/**
 * The templates the browser creates a piece of view from.
 *
 * The compiler writes, for each piece of view, the HTML the server would paint with every value
 * empty and every block closed, as a tagged literal. Creating that piece is cloning it and then
 * adopting the clone with the same code that adopts what the server painted.
 *
 * **Only a literal gets in.** A `TemplateStringsArray` only comes out of a literal written in the
 * code — frozen, with its `raw` beside it — never out of data from the network or a form, so this
 * cannot become a door for HTML nobody wrote. A literal with holes is refused too: a value never
 * goes into a template, it is written afterwards as text, attribute or class.
 *
 * **Lazy.** Nothing is parsed when the module loads: the first clone parses, through the `fudic`
 * Trusted Types policy, and a page that never opens a block never creates the policy.
 */

import { trustedHtmlOf } from './trusted.js';

/** A literal of HTML the compiler wrote, parsed on its first clone and cloned on every other. */
export type Template = () => DocumentFragment;

/** The HTML of a literal with no holes, or `TypeError`. */
function literalOf(strings: TemplateStringsArray): string {
  const html = Array.isArray(strings) && Object.isFrozen(strings) && strings.length === 1 && Array.isArray(strings.raw) ? strings[0] : undefined;
  // `undefined` too for a literal with an escape it cannot cook (`\u`): there is no text to parse.
  if (typeof html !== 'string') throw new TypeError('A fudic template takes one literal with no holes.');
  return html;
}

/** Parse `html` on the first call, and hand out a deep clone of it on every call. */
function cloner(html: string, unwrap: boolean): Template {
  let content: DocumentFragment | undefined;
  return () => {
    if (content === undefined) {
      const holder = document.createElement('template');
      holder.innerHTML = trustedHtmlOf(html);
      content = holder.content;
      // The wrapper only gave its children their namespace: the children are what is created.
      if (unwrap) content.replaceChildren(...content.firstElementChild!.childNodes);
    }
    // Imported, not cloned: a clone of `content` belongs to the template's inert document, where
    // no custom element is ever upgraded — a child host in it could not be raised (`live`) until
    // something moved it into the page. Imported, it is born in the page's document, and a tag
    // already defined is upgraded on the spot.
    return document.importNode(content, true);
  };
}

/** A template of HTML: `` template`<p>Hola </p>` ``. */
export function template(strings: TemplateStringsArray): Template {
  return cloner(literalOf(strings), false);
}

/**
 * A template of a piece that lives inside `<svg>` or `<math>`: the literal is wrapped in that
 * element, so the parser creates its children in the right namespace, and what is cloned is the
 * children, without the wrapper.
 */
export function templateIn(strings: TemplateStringsArray): Template {
  return cloner(literalOf(strings), true);
}
