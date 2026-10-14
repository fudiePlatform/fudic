/**
 * Declarative Shadow DOM, applied by the harness (§4.2, steps 2 and 3).
 *
 * happy-dom's parser knows `shadowrootmode` and `shadowrootserializable` and nothing else, so
 * the HTML goes in through a `<template>` — where nothing is applied — and every
 * `<template shadowrootmode>` is turned into the shadow root it declares here, from the
 * innermost to the outermost, with the `init` its attributes ask for.
 */

/** The `ShadowRootInit` a `<template shadowrootmode>` declares, `referenceTarget` included. */
export type DeclaredInit = ShadowRootInit & { referenceTarget?: string };

/** What the template's attributes ask `attachShadow` for. */
export function initOf(template: Element): DeclaredInit {
  const init: DeclaredInit = {
    mode: 'open',
    delegatesFocus: template.hasAttribute('shadowrootdelegatesfocus'),
    clonable: template.hasAttribute('shadowrootclonable'),
    serializable: template.hasAttribute('shadowrootserializable'),
  };
  const target = template.getAttribute('shadowrootreferencetarget');
  if (target !== null) init.referenceTarget = target;
  return init;
}

/**
 * The sheets `shadowrootadoptedstylesheets` names, from the `<style type="module" specifier>`
 * of `doc`, in order. A specifier with no style adopts nothing, as in the browser.
 */
function sheetsOf(template: Element, doc: Document): CSSStyleSheet[] {
  const specifiers = (template.getAttribute('shadowrootadoptedstylesheets') ?? '').split(' ').filter(Boolean);
  const sheets: CSSStyleSheet[] = [];
  for (const specifier of specifiers) {
    const style = doc.querySelector(`style[type="module"][specifier="${CSS.escape(specifier)}"]`);
    if (style === null) continue;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(style.textContent);
    sheets.push(sheet);
  }
  return sheets;
}

/**
 * Turn every declarative shadow root under `root` into a real one, adopting the sheets of
 * `doc`. A template's content is applied before its own host is, so a host is attached with
 * its subtree already built.
 */
export function applyDsd(root: ParentNode, doc: Document = document): void {
  for (const template of root.querySelectorAll<HTMLTemplateElement>('template[shadowrootmode]')) {
    applyDsd(template.content, doc);
    const host = template.parentElement!;
    const shadow = host.attachShadow(initOf(template));
    shadow.adoptedStyleSheets = sheetsOf(template, doc);
    shadow.append(template.content);
    template.remove();
  }
}

/**
 * Parse `html` with no DSD applied and hand back its nodes, shadow roots attached.
 *
 * Imported into the document before anything is attached: what a `<template>` parses belongs
 * to its inert document, and an element born there is never upgraded when its tag is defined.
 */
export function fragmentOf(html: string): DocumentFragment {
  const holder = document.createElement('template');
  holder.innerHTML = html;
  const fragment = document.importNode(holder.content, true);
  applyDsd(fragment);
  return fragment;
}
