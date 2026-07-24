/**
 * Inline style-adoption polyfill (SDD-18 §5), streaming-safe. It MUST be emitted inline
 * in the page `<head>` and run BEFORE the body streams, or hosts flash unstyled (FOUC);
 * it is a source constant here only so it can be linted and reasoned about on its own —
 * the emitted output is byte-identical to embedding it in `module.ts`.
 *
 * A MutationObserver registers the `<style type="module" specifier>` sheets and adopts
 * each shared sheet into every `[data-adopt]` host's shadow root as it appears; hosts
 * streamed before their sheet wait in `pending`, and a final DOMContentLoaded sweep
 * forces the rest. It reads the specifier from the host's `data-adopt` because the
 * `<template>` (which carries `shadowrootadoptedstylesheets`) is consumed by the parser
 * and gone from the DOM.
 */
export const STYLE_POLYFILL = `(function () {
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
