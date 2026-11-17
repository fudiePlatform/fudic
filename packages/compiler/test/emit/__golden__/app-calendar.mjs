export const tag = "app-calendar";
export const css = `:host{display:block;}.grid{display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.cell{padding:0.25rem;text-align:center;}.cell button{font:inherit;cursor:pointer;}`;

export function render($dom, $shadow, props, $ioc) {
  let { days } = props ?? {}; days ??= ([]);
  $dom.state($shadow, [days]);
  const $n0 = $dom.element("div");
  $dom.setAttr($n0, 'class', "grid");
  const $n1 = $dom.text(" "); $dom.append($n0, $n1);
  const $n2 = $dom.comment(''); $dom.append($n0, $n2);
  for (const day of days) {
    const $n3 = $dom.text(" "); $dom.append($n0, $n3);
    const $n4 = $dom.element("div");
    $dom.setAttr($n4, 'class', "cell");
    const $n5 = $dom.text(" "); $dom.append($n4, $n5);
    const $n6 = $dom.element("span");
    const $n7 = $dom.text(String((day.n) ?? '')); $dom.append($n6, $n7);
    $dom.append($n4, $n6);
    const $n8 = $dom.text(" "); $dom.append($n4, $n8);
    const $n9 = $dom.element("button");
    const $n10 = $dom.text("e"); $dom.append($n9, $n10);
    $dom.append($n4, $n9);
    const $n11 = $dom.text(" "); $dom.append($n4, $n11);
    $dom.append($n0, $n4);
    const $n12 = $dom.text(" "); $dom.append($n0, $n12);
    const $n13 = $dom.comment(''); $dom.append($n0, $n13);
  }
  const $n14 = $dom.text(" "); $dom.append($n0, $n14);
  $dom.append($shadow, $n0);
}