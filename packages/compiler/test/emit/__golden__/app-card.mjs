import { render as renderAppButton } from './app-button.mjs';

export const tag = "app-card";
export const css = `:host{display:block;}.card{border:1px solid #ddd;border-radius:8px;padding:1rem;.body{margin-top:0.5rem;}}.card.highlight{border-color:gold;}`;

export function render($dom, $shadow, props, $ioc) {
  let { title, variant } = props ?? {}; variant ??= ('default');
  $dom.state($shadow, [title, variant]);
  const expanded = () => (false); // inert signal (SSR; hydration is client-side)
  const $n0 = $dom.element("article");
  $dom.setAttr($n0, 'class', "card");
  $dom.toggleClass($n0, "highlight", !!((variant === 'highlight')));
  const $n1 = $dom.element("header");
  const $n2 = $dom.element("h2");
  const $n3 = $dom.text(String((title) ?? '')); $dom.append($n2, $n3);
  $dom.append($n1, $n2);
  $dom.append($n0, $n1);
  const $n4 = $dom.text(" "); $dom.append($n0, $n4);
  const $n5 = $dom.comment(''); $dom.append($n0, $n5);
  if (expanded()) {
    const $n6 = $dom.text(" "); $dom.append($n0, $n6);
    const $n7 = $dom.element("div");
    $dom.setAttr($n7, 'class', "body");
    const $n8 = $dom.element("slot");
    $dom.append($n7, $n8);
    $dom.append($n0, $n7);
    const $n9 = $dom.text(" "); $dom.append($n0, $n9);
    const $n10 = $dom.comment(''); $dom.append($n0, $n10);
  }
  const $n11 = $dom.text(" "); $dom.append($n0, $n11);
  const $n12 = $dom.element("app-button");
  $dom.claim($n12);
  $dom.setAttr($n12, 'data-fud-adopt', "app-button");
  const $n13 = $dom.attachShadow($n12);
  renderAppButton($dom, $n13, { "variant": "ghost" }, $ioc);
  const $n14 = $dom.text(" "); $dom.append($n12, $n14);
  const $n15 = $dom.comment(''); $dom.append($n12, $n15);
  if (expanded()) {
    const $n16 = $dom.text(" Cerrar "); $dom.append($n12, $n16);
    const $n17 = $dom.comment(''); $dom.append($n12, $n17);
  } else {
    const $n18 = $dom.text(" Abrir "); $dom.append($n12, $n18);
    const $n19 = $dom.comment(''); $dom.append($n12, $n19);
  }
  const $n20 = $dom.text(" "); $dom.append($n12, $n20);
  $dom.append($n0, $n12);
  $dom.append($shadow, $n0);
}