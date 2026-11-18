import { layout } from './_layout.mjs';
import { render as renderAppBadge, tag as renderAppBadgeTag, css as renderAppBadgeCss } from './app-badge.mjs';
import { render as renderAppCard, tag as renderAppCardTag, css as renderAppCardCss } from './app-card.mjs';
import { render as renderAppButton, tag as renderAppButtonTag, css as renderAppButtonCss } from './app-button.mjs';

const COMPONENTS = [{ tag: renderAppBadgeTag, css: renderAppBadgeCss }, { tag: renderAppCardTag, css: renderAppCardCss }, { tag: renderAppButtonTag, css: renderAppButtonCss }];
const STYLE_POLYFILL = `(function(){if(!(\`shadowRootAdoptedStyleSheets\`in HTMLTemplateElement.prototype)&&!(typeof CSSStyleSheet!=\`function\`||!CSSStyleSheet.prototype.replaceSync)){var e=new Map,t=new Set,n=new WeakSet,r=function(t){var n=new CSSStyleSheet;n.replaceSync(t.textContent),e.set(t.getAttribute(\`specifier\`),n)},i=function(r,i){if(!n.has(r)){var o=r.shadowRoot;if(!o){t.add(r);return}for(var c=(r.dataset.fudAdopt||\`\`).trim().split(\` \`).filter(Boolean),l=[],u=0;u<c.length;u++){var d=e.get(c[u]);if(!d&&!i){t.add(r);return}d&&l.push(d)}o.adoptedStyleSheets=o.adoptedStyleSheets.concat(l),n.add(r),t.delete(r),s.observe(o,{childList:!0,subtree:!0}),a(o,i)}},a=function(e,t){e.querySelectorAll(\`style[type="module"][specifier]\`).forEach(r),e.querySelectorAll(\`[data-fud-adopt]\`).forEach(function(e){i(e,t)})},o=function(e){Array.from(t).forEach(function(t){i(t,e)})},s=new MutationObserver(function(e){for(var t=0;t<e.length;t++)for(var n=e[t].addedNodes,s=0;s<n.length;s++){var c=n[s];c.nodeType===1&&(c.matches(\`style[type="module"][specifier]\`)?r(c):c.matches(\`[data-fud-adopt]\`)&&i(c,!1),a(c,!1))}o(!1)});s.observe(document.documentElement,{childList:!0,subtree:!0}),document.addEventListener(\`DOMContentLoaded\`,function(){s.takeRecords(),a(document,!0),o(!0),s.disconnect(),t.clear()},{once:!0})}})();`;
const FUD_TREE = {"app-card":["app-button"]};
const FUD_AROUND = ["app-card"];

export async function* page(data, io, $ioc, $props) {
  const { serialize, escapeText, jsonBlock } = io;
  const $nonce = io.nonce ? ' nonce="' + io.nonce + '"' : '';
  yield* layout(data, io, {
    head() {
      let head = '';
      head += '<title>' + (escapeText(String((data.title) ?? ''))) + '</title>';
      // The style-adoption polyfill (SDD-18 §5) goes in <head>, live BEFORE the body streams,
      // so its observer adopts each host sheet as it arrives; the style modules follow it.
      head += '<script' + $nonce + '>' + STYLE_POLYFILL + '</script>';
      head += COMPONENTS.map(function (c) { return '<style type="module"' + $nonce + ' specifier="' + c.tag + '">' + c.css + '</style>'; }).join('');
      return head;
    },
    runtime($inline) {
      let head = '';
      if ($inline) {
        if (io.runtime !== undefined) {
          if (io.alternates !== undefined) head += io.alternates;
          if (io.runtime.boot !== '') {
            head += '<script type="module"' + $nonce + ' src="' + io.runtime.boot + '"></script>';
          }
          if (io.runtime.inline !== '') {
            head += '<script type="module"' + $nonce + '>' + io.runtime.inline + '</script>';
          } else {
            head += '<script type="module"' + $nonce + ' src="' + io.runtime.main + '"></script>';
          }
        }
      } else {
        if (io.runtime !== undefined) {
          if (io.alternates !== undefined) head += io.alternates;
          if (io.runtime.boot !== '') {
            head += '<script type="module"' + $nonce + ' src="' + io.runtime.boot + '"></script>';
          }
          head += io.runtime.pieces.map(function (u) { return '<link rel="modulepreload"' + $nonce + ' href="' + u + '">'; }).join('');
          head += '<script type="module"' + $nonce + ' src="' + io.runtime.main + '"></script>';
        }
      }
      return head;
    },
    *open($dom, $parent) {
    },
    *body($dom, $parent) {
      const $n0 = $dom.element("h1");
      const $n1 = $dom.text(String((data.title) ?? '')); $dom.append($n0, $n1);
      $dom.append($parent, $n0);
      for (const post of data.posts) {
        const $n2 = $dom.text(" "); $dom.append($parent, $n2);
        const $n3 = $dom.element("app-card");
        $dom.claim($n3);
        $dom.setAttr($n3, 'data-fud-adopt', "app-card");
        const $n4 = $dom.attachShadow($n3);
        renderAppCard($dom, $n4, { "title": (post.title), "variant": "default" }, $ioc);
        const $n5 = $dom.text(String((post.summary) ?? '')); $dom.append($n3, $n5);
        $dom.append($parent, $n3);
        const $n6 = $dom.text(" "); $dom.append($parent, $n6);
        const $n7 = $dom.comment(''); $dom.append($parent, $n7);
      }
    },
    *section(name, $dom, $parent) {
      if (name === "scripts") {
        const $n0 = $dom.text(" "); $dom.append($parent, $n0);
        const $n1 = $dom.element("p");
        $dom.setAttr($n1, 'class', "analytics");
        const $n2 = $dom.text(String((data.title) ?? '')); $dom.append($n1, $n2);
        $dom.append($parent, $n1);
        const $n3 = $dom.text(" "); $dom.append($parent, $n3);
      }
    },
    *close($dom, $parent) {
      const $state = $dom.hydrationState();
      if ($state.offsets.length > 1) {
        jsonBlock($dom, $parent, 'fud-state', [$state.offsets, $state.data]);
        jsonBlock($dom, $parent, 'fud-tree', FUD_TREE);
        jsonBlock($dom, $parent, 'fud-around', FUD_AROUND);
      }
      yield* serialize($parent);
    },
  }, $ioc, $props);
}