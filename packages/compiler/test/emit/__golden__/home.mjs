import { render as renderAppCard, tag as renderAppCardTag, css as renderAppCardCss } from './app-card.mjs';
import { render as renderAppButton, tag as renderAppButtonTag, css as renderAppButtonCss } from './app-button.mjs';
import { render as renderAppBadge, tag as renderAppBadgeTag, css as renderAppBadgeCss } from './app-badge.mjs';

const COMPONENTS = [{ tag: renderAppCardTag, css: renderAppCardCss }, { tag: renderAppButtonTag, css: renderAppButtonCss }, { tag: renderAppBadgeTag, css: renderAppBadgeCss }];
const STYLE_POLYFILL = `(function () {
  if ('shadowRootAdoptedStyleSheets' in HTMLTemplateElement.prototype) return;
  if (typeof CSSStyleSheet !== 'function' || !CSSStyleSheet.prototype.replaceSync) return;
  var sheets = new Map(), pending = new Set(), done = new WeakSet();
  var registerStyle = function (el) {
    var s = new CSSStyleSheet();
    s.replaceSync(el.textContent);
    sheets.set(el.getAttribute('specifier'), s);
  };
  var processHost = function (el, force) {
    if (done.has(el)) return;
    var sr = el.shadowRoot;
    if (!sr) { pending.add(el); return; }
    var specs = (el.dataset.adopt || '').trim().split(' ').filter(Boolean), list = [];
    for (var i = 0; i < specs.length; i++) {
      var sheet = sheets.get(specs[i]);
      if (!sheet && !force) { pending.add(el); return; }
      if (sheet) list.push(sheet);
    }
    sr.adoptedStyleSheets = sr.adoptedStyleSheets.concat(list);
    done.add(el); pending.delete(el);
    observer.observe(sr, { childList: true, subtree: true });
    scan(sr, force);
  };
  var scan = function (root, force) {
    root.querySelectorAll('style[type="module"][specifier]').forEach(registerStyle);
    root.querySelectorAll('[data-adopt]').forEach(function (el) { processHost(el, force); });
  };
  var retryPending = function (force) {
    Array.from(pending).forEach(function (el) { processHost(el, force); });
  };
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var nodes = records[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (node.nodeType !== 1) continue;
        if (node.matches('style[type="module"][specifier]')) registerStyle(node);
        else if (node.matches('[data-adopt]')) processHost(node, false);
        scan(node, false);
      }
    }
    retryPending(false);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', function () {
    observer.takeRecords();
    scan(document, true);
    retryPending(true);
    observer.disconnect();
    pending.clear();
  }, { once: true });
})();`;

export function page(data, io) {
  const { createDom, serialize, escapeText } = io;
  const $dom = createDom();
  const $body = $dom.element('body');
  const $n0 = $dom.text("\n    "); $dom.append($body, $n0);
  const $n1 = $dom.element("h1");
  const $n2 = $dom.text(String((data.title) ?? '')); $dom.append($n1, $n2);
  $dom.append($body, $n1);
  const $n3 = $dom.text("\n\n    "); $dom.append($body, $n3);
  if (data.items.length === 0) {
    const $n4 = $dom.text("\n      "); $dom.append($body, $n4);
    const $n5 = $dom.element("p");
    $dom.setAttr($n5, 'class', ["empty"].filter(Boolean).join(' '));
    const $n6 = $dom.text("No hay elementos todavía."); $dom.append($n5, $n6);
    $dom.append($body, $n5);
    const $n7 = $dom.text("\n    "); $dom.append($body, $n7);
  } else {
    const $n8 = $dom.text("\n      "); $dom.append($body, $n8);
    const $n9 = $dom.element("section");
    $dom.setAttr($n9, 'class', ["grid"].filter(Boolean).join(' '));
    const $n10 = $dom.text("\n        "); $dom.append($n9, $n10);
    for (const item of data.items) {
      const $n11 = $dom.text("\n          "); $dom.append($n9, $n11);
      const $n12 = $dom.element("app-card");
      $dom.setAttr($n12, 'data-adopt', "app-card");
      const $n13 = $dom.attachShadow($n12);
      renderAppCard($dom, $n13, { "title": (item.title), "variant": (item.featured ? 'highlight' : 'default') });
      const $n14 = $dom.text("\n            "); $dom.append($n12, $n14);
      if (item.featured) {
        const $n15 = $dom.text("\n              "); $dom.append($n12, $n15);
        const $n16 = $dom.element("app-badge");
        $dom.setAttr($n16, 'data-adopt', "app-badge");
        const $n17 = $dom.attachShadow($n16);
        renderAppBadge($dom, $n17, { "tone": "success" });
        const $n18 = $dom.text("Destacado"); $dom.append($n16, $n18);
        $dom.append($n12, $n16);
        const $n19 = $dom.text("\n            "); $dom.append($n12, $n19);
      }
      const $n20 = $dom.text("\n            "); $dom.append($n12, $n20);
      const $n21 = $dom.text(String((item.description) ?? '')); $dom.append($n12, $n21);
      const $n22 = $dom.text("\n          "); $dom.append($n12, $n22);
      $dom.append($n9, $n12);
      const $n23 = $dom.text("\n        "); $dom.append($n9, $n23);
    }
    const $n24 = $dom.text("\n      "); $dom.append($n9, $n24);
    $dom.append($body, $n9);
    const $n25 = $dom.text("\n    "); $dom.append($body, $n25);
  }
  const $n26 = $dom.text("\n  "); $dom.append($body, $n26);
  const bodyHtml = serialize($body);
  let head = '';
  head += '<title>' + (escapeText(String((data.title) ?? ''))) + '</title>\n';
  head += "  <meta charset=\"utf-8\">\n";
  head += "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n";
  // The style-adoption polyfill (SDD-18 §5) goes in <head>, live BEFORE the body streams,
  // so its observer adopts each host sheet as it arrives; the style modules follow it.
  head += '  <script>' + STYLE_POLYFILL + '</script>\n';
  head += COMPONENTS.map(function (c) { return '  <style type="module" specifier="' + c.tag + '">' + c.css + '</style>'; }).join('\n') + '\n';
  return '<!DOCTYPE html>\n<html lang="es">\n<head>\n' + head + '</head>\n' + bodyHtml + '\n</html>\n';
}