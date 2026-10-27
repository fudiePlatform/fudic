export const tag = "app-list";
export const css = `:host{display:block;}.list{margin:0;padding:0;list-style:none;}.row{display:flex;gap:0.5rem;align-items:baseline;}.tag{font-size:0.7rem;color:#666;}.empty{color:#888;font-style:italic;}`;

export function render($dom, $shadow, props, $ioc) {
  let { rows, empty } = props ?? {}; rows ??= ([]); empty ??= ('Sin elementos');
  $dom.state($shadow, [rows, empty]);
  const $n0 = $dom.element("ul");
  $dom.setAttr($n0, 'class', ["list"].filter(Boolean).join(' '));
  const $n1 = $dom.text(" "); $dom.append($n0, $n1);
  let $n2 = false;
  for (const row of rows) {
    $n2 = true;
    const $n3 = $dom.text(" "); $dom.append($n0, $n3);
    const $n4 = $dom.element("li");
    $dom.setAttr($n4, 'class', ["row"].filter(Boolean).join(' '));
    const $n5 = $dom.text(" "); $dom.append($n4, $n5);
    const $n6 = $dom.element("span");
    const $n7 = $dom.text(String((row.label) ?? '')); $dom.append($n6, $n7);
    $dom.append($n4, $n6);
    const $n8 = $dom.text(" "); $dom.append($n4, $n8);
    for (const mark of row.tags) {
      const $n9 = $dom.text(" "); $dom.append($n4, $n9);
      const $n10 = $dom.element("span");
      $dom.setAttr($n10, 'class', ["tag"].filter(Boolean).join(' '));
      const $n11 = $dom.text(String((mark) ?? '')); $dom.append($n10, $n11);
      $dom.append($n4, $n10);
      const $n12 = $dom.text(" "); $dom.append($n4, $n12);
    }
    const $n13 = $dom.text(" "); $dom.append($n4, $n13);
    $dom.append($n0, $n4);
    const $n14 = $dom.text(" "); $dom.append($n0, $n14);
  }
  if (!$n2) {
    const $n15 = $dom.text(" "); $dom.append($n0, $n15);
    const $n16 = $dom.element("li");
    $dom.setAttr($n16, 'class', ["empty"].filter(Boolean).join(' '));
    const $n17 = $dom.text(String((empty) ?? '')); $dom.append($n16, $n17);
    $dom.append($n0, $n16);
    const $n18 = $dom.text(" "); $dom.append($n0, $n18);
  }
  const $n19 = $dom.text(" "); $dom.append($n0, $n19);
  $dom.append($shadow, $n0);
}