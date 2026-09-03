import { render as renderAppButton } from './app-button.mjs';

export const tag = "app-card";
export const css = `:host{display:block;}.card{border:1px solid #ddd;border-radius:8px;padding:1rem;.body{margin-top:0.5rem;}}.card.highlight{border-color:gold;}`;

export function render($dom, $shadow, props) {
  const { title, variant = 'default' } = props ?? {};
  $dom.state($shadow, [title, variant]);
  const expanded = () => (false); // inert signal (SSR; hydration is client-side)
  const $n0 = $dom.element("article");
  $dom.setAttr($n0, 'class', ["card", (variant === 'highlight') && "highlight"].filter(Boolean).join(' '));
  const $n1 = $dom.element("header");
  const $n2 = $dom.element("h2");
  const $n3 = $dom.text(String((title) ?? '')); $dom.append($n2, $n3);
  $dom.append($n1, $n2);
  $dom.append($n0, $n1);
  const $n4 = $dom.text(" "); $dom.append($n0, $n4);
  if (expanded()) {
    const $n5 = $dom.text(" "); $dom.append($n0, $n5);
    const $n6 = $dom.element("div");
    $dom.setAttr($n6, 'class', ["body"].filter(Boolean).join(' '));
    const $n7 = $dom.element("slot");
    $dom.append($n6, $n7);
    $dom.append($n0, $n6);
    const $n8 = $dom.text(" "); $dom.append($n0, $n8);
  }
  const $n9 = $dom.text(" "); $dom.append($n0, $n9);
  const $n10 = $dom.element("app-button");
  $dom.claim($n10);
  $dom.setAttr($n10, 'data-fud-adopt', "app-button");
  $dom.setAttr($n10, "variant", "ghost");
  const $n11 = $dom.attachShadow($n10);
  renderAppButton($dom, $n11, { "variant": "ghost" });
  const $n12 = $dom.text(" "); $dom.append($n10, $n12);
  if (expanded()) {
    const $n13 = $dom.text(" Cerrar "); $dom.append($n10, $n13);
  } else {
    const $n14 = $dom.text(" Abrir "); $dom.append($n10, $n14);
  }
  const $n15 = $dom.text(" "); $dom.append($n10, $n15);
  $dom.append($n0, $n10);
  $dom.append($shadow, $n0);
}