import { render as renderAppCard, tag as renderAppCardTag, css as renderAppCardCss } from './app-card.mjs';
import { render as renderAppButton, tag as renderAppButtonTag, css as renderAppButtonCss } from './app-button.mjs';
import { render as renderAppBadge, tag as renderAppBadgeTag, css as renderAppBadgeCss } from './app-badge.mjs';

const COMPONENTS = [{ tag: renderAppCardTag, css: renderAppCardCss }, { tag: renderAppButtonTag, css: renderAppButtonCss }, { tag: renderAppBadgeTag, css: renderAppBadgeCss }];
const STYLE_POLYFILL = `(function(){if(!(\`shadowRootAdoptedStyleSheets\`in HTMLTemplateElement.prototype)&&!(typeof CSSStyleSheet!=\`function\`||!CSSStyleSheet.prototype.replaceSync)){var e=new Map,t=new Set,n=new WeakSet,r=function(t){var n=new CSSStyleSheet;n.replaceSync(t.textContent),e.set(t.getAttribute(\`specifier\`),n)},i=function(r,i){if(!n.has(r)){var o=r.shadowRoot;if(!o){t.add(r);return}for(var c=(r.dataset.adopt||\`\`).trim().split(\` \`).filter(Boolean),l=[],u=0;u<c.length;u++){var d=e.get(c[u]);if(!d&&!i){t.add(r);return}d&&l.push(d)}o.adoptedStyleSheets=o.adoptedStyleSheets.concat(l),n.add(r),t.delete(r),s.observe(o,{childList:!0,subtree:!0}),a(o,i)}},a=function(e,t){e.querySelectorAll(\`style[type="module"][specifier]\`).forEach(r),e.querySelectorAll(\`[data-adopt]\`).forEach(function(e){i(e,t)})},o=function(e){Array.from(t).forEach(function(t){i(t,e)})},s=new MutationObserver(function(e){for(var t=0;t<e.length;t++)for(var n=e[t].addedNodes,s=0;s<n.length;s++){var c=n[s];c.nodeType===1&&(c.matches(\`style[type="module"][specifier]\`)?r(c):c.matches(\`[data-adopt]\`)&&i(c,!1),a(c,!1))}o(!1)});s.observe(document.documentElement,{childList:!0,subtree:!0}),document.addEventListener(\`DOMContentLoaded\`,function(){s.takeRecords(),a(document,!0),o(!0),s.disconnect(),t.clear()},{once:!0})}})();`;

export function* page(data, io) {
  const { createDom, serialize, escapeText } = io;
  const $nonce = io.nonce ? ' nonce="' + io.nonce + '"' : '';
  let head = '';
  head += '<title>' + (escapeText(String((data.title) ?? ''))) + '</title>';
  head += "<meta charset=\"utf-8\">";
  head += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  // The style-adoption polyfill (SDD-18 §5) goes in <head>, live BEFORE the body streams,
  // so its observer adopts each host sheet as it arrives; the style modules follow it.
  head += '<script' + $nonce + '>' + STYLE_POLYFILL + '</script>';
  head += COMPONENTS.map(function (c) { return '<style type="module" specifier="' + c.tag + '">' + c.css + '</style>'; }).join('');
  yield '<!DOCTYPE html><html lang="es"><head>' + head + '</head>';
  const $dom = createDom();
  const $body = $dom.element('body');
  const $n0 = $dom.text(" "); $dom.append($body, $n0);
  const $n1 = $dom.element("h1");
  const $n2 = $dom.text(String((data.title) ?? '')); $dom.append($n1, $n2);
  $dom.append($body, $n1);
  const $n3 = $dom.text(" "); $dom.append($body, $n3);
  if (data.items.length === 0) {
    const $n4 = $dom.text(" "); $dom.append($body, $n4);
    const $n5 = $dom.element("p");
    $dom.setAttr($n5, 'class', ["empty"].filter(Boolean).join(' '));
    const $n6 = $dom.text("No hay elementos todavía."); $dom.append($n5, $n6);
    $dom.append($body, $n5);
    const $n7 = $dom.text(" "); $dom.append($body, $n7);
  } else {
    const $n8 = $dom.text(" "); $dom.append($body, $n8);
    const $n9 = $dom.element("section");
    $dom.setAttr($n9, 'class', ["grid"].filter(Boolean).join(' '));
    const $n10 = $dom.text(" "); $dom.append($n9, $n10);
    for (const item of data.items) {
      const $n11 = $dom.text(" "); $dom.append($n9, $n11);
      const $n12 = $dom.element("app-card");
      $dom.setAttr($n12, 'data-adopt', "app-card");
      const $n13 = $dom.attachShadow($n12);
      renderAppCard($dom, $n13, { "title": (item.title), "variant": (item.featured ? 'highlight' : 'default') });
      const $n14 = $dom.text(" "); $dom.append($n12, $n14);
      if (item.featured) {
        const $n15 = $dom.text(" "); $dom.append($n12, $n15);
        const $n16 = $dom.element("app-badge");
        $dom.setAttr($n16, 'data-adopt', "app-badge");
        const $n17 = $dom.attachShadow($n16);
        renderAppBadge($dom, $n17, { "tone": "success" });
        const $n18 = $dom.text("Destacado"); $dom.append($n16, $n18);
        $dom.append($n12, $n16);
        const $n19 = $dom.text(" "); $dom.append($n12, $n19);
      }
      const $n20 = $dom.text(` ${(item.description) ?? ''} `); $dom.append($n12, $n20);
      $dom.append($n9, $n12);
      const $n21 = $dom.text(" "); $dom.append($n9, $n21);
    }
    const $n22 = $dom.text(" "); $dom.append($n9, $n22);
    $dom.append($body, $n9);
    const $n23 = $dom.text(" "); $dom.append($body, $n23);
  }
  const $n24 = $dom.text(" "); $dom.append($body, $n24);
  yield* serialize($body);
  yield '</html>';
}