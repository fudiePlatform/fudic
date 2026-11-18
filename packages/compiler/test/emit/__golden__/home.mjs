import { layout } from './_layout.mjs';
import { render as renderAppCard, tag as renderAppCardTag, css as renderAppCardCss } from './app-card.mjs';
import { render as renderAppButton, tag as renderAppButtonTag, css as renderAppButtonCss } from './app-button.mjs';
import { render as renderAppBadge, tag as renderAppBadgeTag, css as renderAppBadgeCss } from './app-badge.mjs';
import { render as renderAppList, tag as renderAppListTag, css as renderAppListCss } from './app-list.mjs';
import { render as renderAppActions, tag as renderAppActionsTag, css as renderAppActionsCss } from './app-actions.mjs';
import { render as renderAppCalendar, tag as renderAppCalendarTag, css as renderAppCalendarCss } from './app-calendar.mjs';

const COMPONENTS = [{ tag: renderAppCardTag, css: renderAppCardCss }, { tag: renderAppButtonTag, css: renderAppButtonCss }, { tag: renderAppBadgeTag, css: renderAppBadgeCss }, { tag: renderAppListTag, css: renderAppListCss }, { tag: renderAppActionsTag, css: renderAppActionsCss }, { tag: renderAppCalendarTag, css: renderAppCalendarCss }];
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
      if (data.items.length === 0) {
        const $n2 = $dom.text(" "); $dom.append($parent, $n2);
        const $n3 = $dom.element("p");
        $dom.setAttr($n3, 'class', "empty");
        const $n4 = $dom.text("No hay elementos todavía."); $dom.append($n3, $n4);
        $dom.append($parent, $n3);
        const $n5 = $dom.text(" "); $dom.append($parent, $n5);
        const $n6 = $dom.comment(''); $dom.append($parent, $n6);
      } else {
        const $n7 = $dom.text(" "); $dom.append($parent, $n7);
        const $n8 = $dom.element("section");
        $dom.setAttr($n8, 'class', "grid");
        const $n9 = $dom.text(" "); $dom.append($n8, $n9);
        const $n10 = $dom.comment(''); $dom.append($n8, $n10);
        for (const item of data.items) {
          const $n11 = $dom.text(" "); $dom.append($n8, $n11);
          const $n12 = $dom.element("app-card");
          $dom.claim($n12);
          $dom.setAttr($n12, 'data-fud-adopt', "app-card");
          const $n13 = $dom.attachShadow($n12);
          renderAppCard($dom, $n13, { "title": (item.title), "variant": (item.featured ? 'highlight' : 'default') }, $ioc);
          const $n14 = $dom.text(" "); $dom.append($n12, $n14);
          const $n15 = $dom.comment(''); $dom.append($n12, $n15);
          if (item.featured) {
            const $n16 = $dom.text(" "); $dom.append($n12, $n16);
            const $n17 = $dom.element("app-badge");
            $dom.setAttr($n17, 'data-fud-adopt', "app-badge");
            const $n18 = $dom.attachShadow($n17);
            renderAppBadge($dom, $n18, { "tone": "success" }, $ioc);
            const $n19 = $dom.text("Destacado"); $dom.append($n17, $n19);
            $dom.append($n12, $n17);
            const $n20 = $dom.text(" "); $dom.append($n12, $n20);
            const $n21 = $dom.comment(''); $dom.append($n12, $n21);
          }
          const $n22 = $dom.text(` ${(item.description) ?? ''} `); $dom.append($n12, $n22);
          $dom.append($n8, $n12);
          const $n23 = $dom.text(" "); $dom.append($n8, $n23);
          const $n24 = $dom.comment(''); $dom.append($n8, $n24);
        }
        const $n25 = $dom.text(" "); $dom.append($n8, $n25);
        $dom.append($parent, $n8);
        const $n26 = $dom.text(" "); $dom.append($parent, $n26);
        const $n27 = $dom.comment(''); $dom.append($parent, $n27);
      }
    },
    *section(name, $dom, $parent) {
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