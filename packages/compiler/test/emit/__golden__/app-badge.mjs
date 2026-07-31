export const tag = "app-badge";
export const css = `
    :host { display: inline-block; }
    .badge {
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border: 1px solid #ccc;
      border-radius: 999px;
      background: #f3f3f3;
      color: #444;
    }
    .badge.success { background: #e6f4ea; border-color: #34a853; color: #1e7e34; }
    .badge.warning { background: #fef7e0; border-color: #f9ab00; color: #b06000; }
  `;

export function render($dom, $shadow, props) {
  const { tone = 'neutral' } = props ?? {};
  const $n0 = $dom.text(" "); $dom.append($shadow, $n0);
  const $n1 = $dom.element("span");
  $dom.setAttr($n1, 'class', ["badge", (tone === 'success') && "success", (tone === 'warning') && "warning"].filter(Boolean).join(' '));
  const $n2 = $dom.text(" "); $dom.append($n1, $n2);
  const $n3 = $dom.element("slot");
  $dom.append($n1, $n3);
  const $n4 = $dom.text(" "); $dom.append($n1, $n4);
  $dom.append($shadow, $n1);
  const $n5 = $dom.text(" "); $dom.append($shadow, $n5);
}