export const tag = "app-actions";
export const css = `:host{display:block;}.list{margin:0;padding:0;list-style:none;}.row{display:flex;gap:0.5rem;align-items:baseline;}.row button{font:inherit;cursor:pointer;}`;

export function render($dom, $shadow, props, $ioc) {
  let { rows } = props ?? {}; rows ??= ([]);
  $dom.state($shadow, [rows]);
  const $n0 = $dom.element("ul");
  $dom.setAttr($n0, 'class', "list");
  const $n1 = $dom.text(" "); $dom.append($n0, $n1);
  const $n2 = $dom.comment(''); $dom.append($n0, $n2);
  for (const row of rows) {
    const $n3 = $dom.text(" "); $dom.append($n0, $n3);
    const $n4 = $dom.element("li");
    $dom.setAttr($n4, 'class', "row");
    const $n5 = $dom.text(" "); $dom.append($n4, $n5);
    const $n6 = $dom.element("span");
    const $n7 = $dom.text(String((row.label) ?? '')); $dom.append($n6, $n7);
    $dom.append($n4, $n6);
    const $n8 = $dom.text(" "); $dom.append($n4, $n8);
    const $n9 = $dom.element("button");
    $dom.setAttr($n9, 'class', "none");
    const $n10 = $dom.text("-"); $dom.append($n9, $n10);
    $dom.append($n4, $n9);
    const $n11 = $dom.text(" "); $dom.append($n4, $n11);
    const $n12 = $dom.element("button");
    $dom.setAttr($n12, 'class', "event");
    const $n13 = $dom.text("e"); $dom.append($n12, $n13);
    $dom.append($n4, $n12);
    const $n14 = $dom.text(" "); $dom.append($n4, $n14);
    const $n15 = $dom.element("button");
    $dom.setAttr($n15, 'class', "data");
    const $n16 = $dom.text("d"); $dom.append($n15, $n16);
    $dom.append($n4, $n15);
    const $n17 = $dom.text(" "); $dom.append($n4, $n17);
    const $n18 = $dom.element("button");
    $dom.setAttr($n18, 'class', "both");
    const $n19 = $dom.text("ed"); $dom.append($n18, $n19);
    $dom.append($n4, $n18);
    const $n20 = $dom.text(" "); $dom.append($n4, $n20);
    const $n21 = $dom.element("button");
    $dom.setAttr($n21, 'class', "reversed");
    const $n22 = $dom.text("de"); $dom.append($n21, $n22);
    $dom.append($n4, $n21);
    const $n23 = $dom.text(" "); $dom.append($n4, $n23);
    const $n24 = $dom.element("button");
    $dom.setAttr($n24, 'class', "bare");
    const $n25 = $dom.text("x"); $dom.append($n24, $n25);
    $dom.append($n4, $n24);
    const $n26 = $dom.text(" "); $dom.append($n4, $n26);
    $dom.append($n0, $n4);
    const $n27 = $dom.text(" "); $dom.append($n0, $n27);
    const $n28 = $dom.comment(''); $dom.append($n0, $n28);
  }
  const $n29 = $dom.text(" "); $dom.append($n0, $n29);
  $dom.append($shadow, $n0);
}