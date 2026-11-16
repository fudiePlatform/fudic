export const tag = "app-list";
export const css = `:host{display:block;}.list{margin:0;padding:0;list-style:none;}.row{display:flex;gap:0.5rem;align-items:baseline;}.tag{font-size:0.7rem;color:#666;}.empty{color:#888;font-style:italic;}`;

export function render($dom, $shadow, props, $ioc) {
  let { rows, empty } = props ?? {}; rows ??= ([]); empty ??= ('Sin elementos');
  $dom.state($shadow, [rows, empty]);
  const $n0 = $dom.element("ul");
  $dom.setAttr($n0, 'class', "list");
  const $n1 = $dom.text(" "); $dom.append($n0, $n1);
  const $n2 = $dom.comment(''); $dom.append($n0, $n2);
  let $n3 = false;
  for (const row of rows) {
    $n3 = true;
    const $n4 = $dom.text(" "); $dom.append($n0, $n4);
    const $n5 = $dom.element("li");
    $dom.setAttr($n5, 'class', "row");
    const $n6 = $dom.text(" "); $dom.append($n5, $n6);
    const $n7 = $dom.element("span");
    const $n8 = $dom.text(String((row.label) ?? '')); $dom.append($n7, $n8);
    $dom.append($n5, $n7);
    const $n9 = $dom.text(" "); $dom.append($n5, $n9);
    const $n10 = $dom.comment(''); $dom.append($n5, $n10);
    for (const mark of row.tags) {
      const $n11 = $dom.text(" "); $dom.append($n5, $n11);
      const $n12 = $dom.element("span");
      $dom.setAttr($n12, 'class', "tag");
      const $n13 = $dom.text(String((mark) ?? '')); $dom.append($n12, $n13);
      $dom.append($n5, $n12);
      const $n14 = $dom.text(" "); $dom.append($n5, $n14);
      const $n15 = $dom.comment(''); $dom.append($n5, $n15);
    }
    const $n16 = $dom.text(" "); $dom.append($n5, $n16);
    $dom.append($n0, $n5);
    const $n17 = $dom.text(" "); $dom.append($n0, $n17);
    const $n18 = $dom.comment(''); $dom.append($n0, $n18);
  }
  if (!$n3) {
    const $n19 = $dom.text(" "); $dom.append($n0, $n19);
    const $n20 = $dom.element("li");
    $dom.setAttr($n20, 'class', "empty");
    const $n21 = $dom.text(String((empty) ?? '')); $dom.append($n20, $n21);
    $dom.append($n0, $n20);
    const $n22 = $dom.text(" "); $dom.append($n0, $n22);
    const $n23 = $dom.comment(''); $dom.append($n0, $n23);
  }
  const $n24 = $dom.text(" "); $dom.append($n0, $n24);
  $dom.append($shadow, $n0);
}