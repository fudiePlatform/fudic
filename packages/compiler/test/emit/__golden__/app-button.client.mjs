import { FudicElement } from '@fudic/core';

customElements.define("app-button", class extends FudicElement {
  static c($props) {
    let $n0, $n1, $n2, $n3, $n4, $n5;
    const $r = [];
    const $d = []; // teardowns
    let [$dom, $shadow, variant = 'primary', disabled = false] = $props;
    function onClick(e: MouseEvent) {
      const host = (e.currentTarget as HTMLElement).closest('app-button');
      host?.dispatchEvent(new CustomEvent('press', { bubbles: true }));
    }

    const m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const s = () => {};

    return {
      c: () => {
        $n0 = $dom.text(" ");
        $r.push($n0);
        $n1 = $dom.element("button");
        { const $a = (disabled); if ($a === true) $dom.setAttr($n1, "disabled", ''); else if ($a !== false && $a != null) $dom.setAttr($n1, "disabled", String($a)); }
        $dom.setAttr($n1, 'class', ["btn", (variant === 'primary') && "primary", (variant === 'ghost') && "ghost"].filter(Boolean).join(' '));
        $n2 = $dom.text(" ");
        $dom.append($n1, $n2);
        $n3 = $dom.element("slot");
        $dom.append($n1, $n3);
        $n4 = $dom.text(" ");
        $dom.append($n1, $n4);
        $r.push($n1);
        $n5 = $dom.text(" ");
        $r.push($n5);
        m();
        s();
      },
      h: () => {
        let $c0 = $dom.firstChild($shadow);
        $n0 = $c0; $c0 = $dom.nextSibling($c0);
        $n1 = $c0; $c0 = $dom.nextSibling($c0);
        {
          let $c1 = $dom.firstChild($n1);
          $n2 = $c1; $c1 = $dom.nextSibling($c1);
          $n3 = $c1; $c1 = $dom.nextSibling($c1);
          $n4 = $c1; $c1 = $dom.nextSibling($c1);
        }
        $n5 = $c0; $c0 = $dom.nextSibling($c0);
        s();
      },
      r: () => { $n0 = $n1 = $n2 = $n3 = $n4 = $n5 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});