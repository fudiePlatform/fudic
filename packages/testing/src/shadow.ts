/**
 * What each shadow root was asked to be (§3.4, §4.4).
 *
 * happy-dom keeps part of a `ShadowRootInit` and drops the rest — `referenceTarget` is not a
 * property of its shadow roots, and `delegatesFocus` does not survive. So, while the
 * environment lives, `attachShadow` is wrapped and the `init` of every call is noted against
 * its host, whoever made it: the harness applying a declarative shadow root, or the runtime
 * creating a component in the browser.
 */

import type { DeclaredInit } from './dsd.js';

/** The options a shadow root was born with, as a test compares them. */
export interface ShadowShape {
  readonly mode: 'open';
  readonly delegatesFocus: boolean;
  readonly clonable: boolean;
  readonly serializable: boolean;
  readonly referenceTarget: string | null;
  /** The specifiers of the adopted sheets, in order. The component's own is `'self'`. */
  readonly adoptedStyleSheets: readonly string[];
}

let inits = new WeakMap<Element, DeclaredInit>();

/** Wrap `attachShadow` so every `init` is noted. Once per environment. */
export function recordShadowInits(proto: Element = Element.prototype): void {
  const attach = proto.attachShadow;
  proto.attachShadow = function (this: Element, init: ShadowRootInit): ShadowRoot {
    const root = attach.call(this, init);
    inits.set(this, { ...init });
    return root;
  };
}

/** Forget every `init` noted so far: a test does not see the hosts of the one before (§4.8). */
export function forgetShadowInits(): void {
  inits = new WeakMap();
}

/** The text of a sheet, rule by rule, which is what two sheets of one source share. */
function textOf(sheet: CSSStyleSheet): string {
  return [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
}

/** The specifier of the `<style type="module">` a sheet was built from, or `'?'`. */
function specifierOf(sheet: CSSStyleSheet, doc: Document): string {
  const text = textOf(sheet);
  for (const style of doc.querySelectorAll('style[type="module"][specifier]')) {
    const reference = new CSSStyleSheet();
    reference.replaceSync(style.textContent);
    if (textOf(reference) === text) return style.getAttribute('specifier')!;
  }
  return '?';
}

/** The shape of `host`'s shadow root: what its `attachShadow` asked for, and what it adopted. */
export function shadowOf(host: Element): ShadowShape {
  const init = inits.get(host);
  const root = host.shadowRoot;
  if (init === undefined || root === null) {
    throw new Error(`<${host.localName}> has no shadow root`);
  }
  return {
    mode: 'open',
    delegatesFocus: init.delegatesFocus === true,
    clonable: init.clonable === true,
    serializable: init.serializable === true,
    referenceTarget: init.referenceTarget ?? null,
    adoptedStyleSheets: root.adoptedStyleSheets.map((sheet) => {
      const specifier = specifierOf(sheet, host.ownerDocument);
      return specifier === host.localName ? 'self' : specifier;
    }),
  };
}

