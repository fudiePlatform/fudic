import { render as renderAppBadge } from './app-badge.mjs';

export async function* layout(data, io, route, $ioc, $props) {
  const { createDom, serialize, escapeText, escapeAttr } = io;
  let head = '';
  head += "<meta charset=\"utf-8\">";
  head += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  head += route.head();
  let $open;
  {
    const $dom = io.createDom();
    const $el = $dom.element("html");
    $dom.setAttr($el, "lang", "es");
    $open = [...io.serialize($el)][0].slice(0, -1);
  }
  $open += '>';
  yield '<!DOCTYPE html>' + $open + '<head>' + head + '</head>';
  const $dom = createDom();
  const $body = $dom.element('body');
  yield* route.open($dom, $body);
  const $n0 = $dom.text(" "); $dom.append($body, $n0);
  const $n1 = $dom.element("header");
  $dom.setAttr($n1, 'class', "site");
  const $n2 = $dom.element("app-badge");
  $dom.setAttr($n2, 'data-fud-adopt', "app-badge");
  const $n3 = $dom.attachShadow($n2);
  renderAppBadge($dom, $n3, { "tone": "info" }, $ioc);
  const $n4 = $dom.text("fudic"); $dom.append($n2, $n4);
  $dom.append($n1, $n2);
  $dom.append($body, $n1);
  const $n5 = $dom.text(" "); $dom.append($body, $n5);
  const $n6 = $dom.element("main");
  $dom.append($body, $n6);
  yield* route.body($dom, $n6);
  const $n7 = $dom.text(" "); $dom.append($body, $n7);
  const $n8 = $dom.element("footer");
  const $n9 = $dom.text("fudic 2026"); $dom.append($n8, $n9);
  $dom.append($body, $n8);
  const $n10 = $dom.text(" "); $dom.append($body, $n10);
  yield* route.section("scripts", $dom, $body);
  const $n11 = $dom.text(" "); $dom.append($body, $n11);
  yield* route.close($dom, $body);
  yield '</html>';
}