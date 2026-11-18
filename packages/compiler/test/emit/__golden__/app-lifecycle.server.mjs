import { render as renderAppLifecycleRow } from './app-lifecycle-row.mjs';

export const tag = "app-lifecycle";
export const css = `:host{display:block;}:host([variant="highlight"]) .box{border-color:gold;}.box{border:1px solid #ddd;}`;

export function render($dom, $shadow, props, $ioc) {
  let { variant, rows } = props ?? {}; variant ??= ('default'); rows ??= ([]);
  $dom.state($shadow, [variant, rows]);
  const $host = $dom.host($shadow);
  $dom.setAttr($host, "role", "group");
  { const $v = (variant); if ($v === true) $dom.setAttr($host, "variant", ''); else if ($v !== false && $v != null) $dom.setAttr($host, "variant", String($v)); }
  const $n0 = $dom.element("div");
  $dom.setAttr($n0, 'class', "box");
  for (const row of rows) {
    const $n1 = $dom.element("app-lifecycle-row");
    $dom.claim($n1);
    const $n2 = $dom.attachShadow($n1);
    renderAppLifecycleRow($dom, $n2, { "label": (row.label) }, $ioc);
    $dom.append($n0, $n1);
  }
  $dom.append($shadow, $n0);
}