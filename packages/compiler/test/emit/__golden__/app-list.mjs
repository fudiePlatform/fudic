export const tag = "app-list";
export const css = `:host{display:block;}.list{margin:0;padding:0;list-style:none;}.row{display:flex;gap:0.5rem;align-items:baseline;}.tag{font-size:0.7rem;color:#666;}.empty{color:#888;font-style:italic;}`;

export function render($dom, $shadow, props) {
  const { rows, empty = 'Sin elementos' } = props ?? {};
  const $n0 = $dom.text(" "); $dom.append($shadow, $n0);
  if (rows === undefined || rows.length === 0) {
    const $n1 = $dom.text(" "); $dom.append($shadow, $n1);
    const $n2 = $dom.element("p");
    $dom.setAttr($n2, 'class', ["empty"].filter(Boolean).join(' '));
    const $n3 = $dom.text(String((empty) ?? '')); $dom.append($n2, $n3);
    $dom.append($shadow, $n2);
    const $n4 = $dom.text(" "); $dom.append($shadow, $n4);
  } else {
    const $n5 = $dom.text(" "); $dom.append($shadow, $n5);
    const $n6 = $dom.element("ul");
    $dom.setAttr($n6, 'class', ["list"].filter(Boolean).join(' '));
    const $n7 = $dom.text(" "); $dom.append($n6, $n7);
    for (const row of rows) {
      const $n8 = $dom.text(" "); $dom.append($n6, $n8);
      const $n9 = $dom.element("li");
      $dom.setAttr($n9, 'class', ["row"].filter(Boolean).join(' '));
      const $n10 = $dom.text(" "); $dom.append($n9, $n10);
      const $n11 = $dom.element("span");
      const $n12 = $dom.text(String((row.label) ?? '')); $dom.append($n11, $n12);
      $dom.append($n9, $n11);
      const $n13 = $dom.text(" "); $dom.append($n9, $n13);
      for (const mark of row.tags) {
        const $n14 = $dom.text(" "); $dom.append($n9, $n14);
        const $n15 = $dom.element("span");
        $dom.setAttr($n15, 'class', ["tag"].filter(Boolean).join(' '));
        const $n16 = $dom.text(String((mark) ?? '')); $dom.append($n15, $n16);
        $dom.append($n9, $n15);
        const $n17 = $dom.text(" "); $dom.append($n9, $n17);
      }
      const $n18 = $dom.text(" "); $dom.append($n9, $n18);
      $dom.append($n6, $n9);
      const $n19 = $dom.text(" "); $dom.append($n6, $n19);
    }
    const $n20 = $dom.text(" "); $dom.append($n6, $n20);
    $dom.append($shadow, $n6);
    const $n21 = $dom.text(" "); $dom.append($shadow, $n21);
  }
  const $n22 = $dom.text(" "); $dom.append($shadow, $n22);
}