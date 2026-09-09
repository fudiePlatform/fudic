export const tag = "app-list";
export const css = `:host{display:block;}.list{margin:0;padding:0;list-style:none;}.row{display:flex;gap:0.5rem;align-items:baseline;}.tag{font-size:0.7rem;color:#666;}.empty{color:#888;font-style:italic;}`;

export function render($dom, $shadow, props, $ioc) {
  const { rows, empty = 'Sin elementos' } = props ?? {};
  $dom.state($shadow, [rows, empty]);
  if (rows === undefined || rows.length === 0) {
    const $n0 = $dom.element("p");
    $dom.setAttr($n0, 'class', ["empty"].filter(Boolean).join(' '));
    const $n1 = $dom.text(String((empty) ?? '')); $dom.append($n0, $n1);
    $dom.append($shadow, $n0);
  } else {
    const $n2 = $dom.element("ul");
    $dom.setAttr($n2, 'class', ["list"].filter(Boolean).join(' '));
    const $n3 = $dom.text(" "); $dom.append($n2, $n3);
    for (const row of rows) {
      const $n4 = $dom.text(" "); $dom.append($n2, $n4);
      const $n5 = $dom.element("li");
      $dom.setAttr($n5, 'class', ["row"].filter(Boolean).join(' '));
      const $n6 = $dom.text(" "); $dom.append($n5, $n6);
      const $n7 = $dom.element("span");
      const $n8 = $dom.text(String((row.label) ?? '')); $dom.append($n7, $n8);
      $dom.append($n5, $n7);
      const $n9 = $dom.text(" "); $dom.append($n5, $n9);
      for (const mark of row.tags) {
        const $n10 = $dom.text(" "); $dom.append($n5, $n10);
        const $n11 = $dom.element("span");
        $dom.setAttr($n11, 'class', ["tag"].filter(Boolean).join(' '));
        const $n12 = $dom.text(String((mark) ?? '')); $dom.append($n11, $n12);
        $dom.append($n5, $n11);
        const $n13 = $dom.text(" "); $dom.append($n5, $n13);
      }
      const $n14 = $dom.text(" "); $dom.append($n5, $n14);
      $dom.append($n2, $n5);
      const $n15 = $dom.text(" "); $dom.append($n2, $n15);
    }
    const $n16 = $dom.text(" "); $dom.append($n2, $n16);
    $dom.append($shadow, $n2);
  }
}