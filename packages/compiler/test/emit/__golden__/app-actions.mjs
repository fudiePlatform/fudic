export const tag = "app-actions";
export const css = `:host{display:block;}.list{margin:0;padding:0;list-style:none;}.row{display:flex;gap:0.5rem;align-items:baseline;}.row button{font:inherit;cursor:pointer;}`;

export function render($dom, $shadow, props, $ioc) {
  const { rows = [] } = props ?? {};
  $dom.state($shadow, [rows]);
  const $n0 = $dom.element("ul");
  $dom.setAttr($n0, 'class', ["list"].filter(Boolean).join(' '));
  const $n1 = $dom.text(" "); $dom.append($n0, $n1);
  for (const row of rows) {
    const $n2 = $dom.text(" "); $dom.append($n0, $n2);
    const $n3 = $dom.element("li");
    $dom.setAttr($n3, 'class', ["row"].filter(Boolean).join(' '));
    const $n4 = $dom.text(" "); $dom.append($n3, $n4);
    const $n5 = $dom.element("span");
    const $n6 = $dom.text(String((row.label) ?? '')); $dom.append($n5, $n6);
    $dom.append($n3, $n5);
    const $n7 = $dom.text(" "); $dom.append($n3, $n7);
    const $n8 = $dom.element("button");
    $dom.setAttr($n8, 'class', ["none"].filter(Boolean).join(' '));
    const $n9 = $dom.text("-"); $dom.append($n8, $n9);
    $dom.append($n3, $n8);
    const $n10 = $dom.text(" "); $dom.append($n3, $n10);
    const $n11 = $dom.element("button");
    $dom.setAttr($n11, 'class', ["event"].filter(Boolean).join(' '));
    const $n12 = $dom.text("e"); $dom.append($n11, $n12);
    $dom.append($n3, $n11);
    const $n13 = $dom.text(" "); $dom.append($n3, $n13);
    const $n14 = $dom.element("button");
    $dom.setAttr($n14, 'class', ["data"].filter(Boolean).join(' '));
    const $n15 = $dom.text("d"); $dom.append($n14, $n15);
    $dom.append($n3, $n14);
    const $n16 = $dom.text(" "); $dom.append($n3, $n16);
    const $n17 = $dom.element("button");
    $dom.setAttr($n17, 'class', ["both"].filter(Boolean).join(' '));
    const $n18 = $dom.text("ed"); $dom.append($n17, $n18);
    $dom.append($n3, $n17);
    const $n19 = $dom.text(" "); $dom.append($n3, $n19);
    const $n20 = $dom.element("button");
    $dom.setAttr($n20, 'class', ["reversed"].filter(Boolean).join(' '));
    const $n21 = $dom.text("de"); $dom.append($n20, $n21);
    $dom.append($n3, $n20);
    const $n22 = $dom.text(" "); $dom.append($n3, $n22);
    const $n23 = $dom.element("button");
    $dom.setAttr($n23, 'class', ["bare"].filter(Boolean).join(' '));
    const $n24 = $dom.text("x"); $dom.append($n23, $n24);
    $dom.append($n3, $n23);
    const $n25 = $dom.text(" "); $dom.append($n3, $n25);
    $dom.append($n0, $n3);
    const $n26 = $dom.text(" "); $dom.append($n0, $n26);
  }
  const $n27 = $dom.text(" "); $dom.append($n0, $n27);
  $dom.append($shadow, $n0);
}