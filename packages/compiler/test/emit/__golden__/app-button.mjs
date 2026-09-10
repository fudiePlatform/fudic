export const tag = "app-button";
export const css = `:host{display:inline-block;}.btn{font:inherit;padding:0.5rem 1rem;border:1px solid currentColor;border-radius:6px;cursor:pointer;background:transparent;}.btn.primary{background:#1a73e8;color:white;border-color:#1a73e8;}.btn.ghost{color:#1a73e8;}.btn:disabled{opacity:0.5;cursor:not-allowed;}`;

export function render($dom, $shadow, props, $ioc) {
  const { variant = 'primary', disabled = false } = props ?? {};
  $dom.state($shadow, [variant, disabled]);
  const $n0 = $dom.element("button");
  { const $v = (disabled); if ($v === true) $dom.setAttr($n0, "disabled", ''); else if ($v !== false && $v != null) $dom.setAttr($n0, "disabled", String($v)); }
  $dom.setAttr($n0, 'class', ["btn", (variant === 'primary') && "primary", (variant === 'ghost') && "ghost"].filter(Boolean).join(' '));
  const $n1 = $dom.element("slot");
  $dom.append($n0, $n1);
  $dom.append($shadow, $n0);
}