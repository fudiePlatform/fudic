import { render as renderAppButton } from './app-button.mjs';

export const tag = "app-card";
export const css = `:host{display:block;}.card{border:1px solid #ddd;border-radius:8px;padding:1rem;.body{margin-top:0.5rem;}}.card.highlight{border-color:gold;}`;

export function render($dom, $shadow, props) {
  const { title, variant = 'default' } = props ?? {};
  $dom.state($shadow, [title, variant]);
  const expanded = () => (false); // inert signal (SSR; hydration is client-side)
  const $n0 = $dom.text(" "); $dom.append($shadow, $n0);
  const $n1 = $dom.element("article");
  $dom.setAttr($n1, 'class', ["card", (variant === 'highlight') && "highlight"].filter(Boolean).join(' '));
  const $n2 = $dom.text(" "); $dom.append($n1, $n2);
  const $n3 = $dom.element("header");
  const $n4 = $dom.text(" "); $dom.append($n3, $n4);
  const $n5 = $dom.element("h2");
  const $n6 = $dom.text(String((title) ?? '')); $dom.append($n5, $n6);
  $dom.append($n3, $n5);
  const $n7 = $dom.text(" "); $dom.append($n3, $n7);
  $dom.append($n1, $n3);
  const $n8 = $dom.text(" "); $dom.append($n1, $n8);
  if (expanded()) {
    const $n9 = $dom.text(" "); $dom.append($n1, $n9);
    const $n10 = $dom.element("div");
    $dom.setAttr($n10, 'class', ["body"].filter(Boolean).join(' '));
    const $n11 = $dom.text(" "); $dom.append($n10, $n11);
    const $n12 = $dom.element("slot");
    $dom.append($n10, $n12);
    const $n13 = $dom.text(" "); $dom.append($n10, $n13);
    $dom.append($n1, $n10);
    const $n14 = $dom.text(" "); $dom.append($n1, $n14);
  }
  const $n15 = $dom.text(" "); $dom.append($n1, $n15);
  const $n16 = $dom.element("app-button");
  $dom.claim($n16);
  $dom.setAttr($n16, 'data-fud-adopt', "app-button");
  $dom.setAttr($n16, "variant", "ghost");
  const $n17 = $dom.attachShadow($n16);
  renderAppButton($dom, $n17, { "variant": "ghost" });
  const $n18 = $dom.text(" "); $dom.append($n16, $n18);
  if (expanded()) {
    const $n19 = $dom.text(" Cerrar "); $dom.append($n16, $n19);
  } else {
    const $n20 = $dom.text(" Abrir "); $dom.append($n16, $n20);
  }
  const $n21 = $dom.text(" "); $dom.append($n16, $n21);
  $dom.append($n1, $n16);
  const $n22 = $dom.text(" "); $dom.append($n1, $n22);
  $dom.append($shadow, $n1);
  const $n23 = $dom.text(" "); $dom.append($shadow, $n23);
}