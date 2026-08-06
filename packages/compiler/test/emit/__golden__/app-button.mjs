export const tag = "app-button";
export const css = `:host{display:inline-block;}.btn{font:inherit;padding:0.5rem 1rem;border:1px solid currentColor;border-radius:6px;cursor:pointer;background:transparent;}.btn.primary{background:#1a73e8;color:white;border-color:#1a73e8;}.btn.ghost{color:#1a73e8;}.btn:disabled{opacity:0.5;cursor:not-allowed;}`;

export function render($dom, $shadow, props) {
  const { variant = 'primary', disabled = false } = props ?? {};
  const $n0 = $dom.text(" "); $dom.append($shadow, $n0);
  const $n1 = $dom.element("button");
  { const $v = (disabled); if ($v === true) $dom.setAttr($n1, "disabled", ''); else if ($v !== false && $v != null) $dom.setAttr($n1, "disabled", String($v)); }
  $dom.setAttr($n1, 'class', ["btn", (variant === 'primary') && "primary", (variant === 'ghost') && "ghost"].filter(Boolean).join(' '));
  const $n2 = $dom.text(" "); $dom.append($n1, $n2);
  const $n3 = $dom.element("slot");
  $dom.append($n1, $n3);
  const $n4 = $dom.text(" "); $dom.append($n1, $n4);
  $dom.append($shadow, $n1);
  const $n5 = $dom.text(" "); $dom.append($shadow, $n5);
}