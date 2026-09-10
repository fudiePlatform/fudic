export const tag = "app-calendar";
export const css = `:host{display:block;}.grid{display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.cell{padding:0.25rem;text-align:center;}.cell button{font:inherit;cursor:pointer;}`;

export function render($dom, $shadow, props) {
  const { days = [] } = props ?? {};
  $dom.state($shadow, [days]);
  const $n0 = $dom.element("div");
  $dom.setAttr($n0, 'class', ["grid"].filter(Boolean).join(' '));
  const $n1 = $dom.text(" "); $dom.append($n0, $n1);
  for (const day of days) {
    const $n2 = $dom.text(" "); $dom.append($n0, $n2);
    const $n3 = $dom.element("div");
    $dom.setAttr($n3, 'class', ["cell"].filter(Boolean).join(' '));
    const $n4 = $dom.text(" "); $dom.append($n3, $n4);
    const $n5 = $dom.element("span");
    const $n6 = $dom.text(String((day.n) ?? '')); $dom.append($n5, $n6);
    $dom.append($n3, $n5);
    const $n7 = $dom.text(" "); $dom.append($n3, $n7);
    const $n8 = $dom.element("button");
    const $n9 = $dom.text("e"); $dom.append($n8, $n9);
    $dom.append($n3, $n8);
    const $n10 = $dom.text(" "); $dom.append($n3, $n10);
    $dom.append($n0, $n3);
    const $n11 = $dom.text(" "); $dom.append($n0, $n11);
  }
  const $n12 = $dom.text(" "); $dom.append($n0, $n12);
  $dom.append($shadow, $n0);
}