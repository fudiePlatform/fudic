import { FudicElement } from '@fudic/core';

customElements.define("app-button", class extends FudicElement {
  static c($props) {
    let $n0, $n1;
    const $r = [];
    const $d = []; // teardowns
    const $w = []; // last applied, per value write
    let [$dom, $shadow, variant = 'primary', disabled = false] = $props;
    function onClick(e: MouseEvent) {
      const host = (e.currentTarget as HTMLElement).closest('app-button');
      host?.dispatchEvent(new CustomEvent('press', { bubbles: true }));
    }

    const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const $s = () => {};
    const $a = () => {
      let $v;
      $v = (disabled);
      if ($v !== $w[0]) { $w[0] = $v; if ($v === true) $dom.setAttr($n0, "disabled", ''); else if ($v !== false && $v != null) $dom.setAttr($n0, "disabled", String($v)); else $dom.removeAttr($n0, "disabled"); }
      $v = ["btn", (variant === 'primary') && "primary", (variant === 'ghost') && "ghost"].filter(Boolean).join(' ');
      if ($v !== $w[1]) { $w[1] = $v; $dom.setAttr($n0, 'class', $v); }
    };

    return {
      c: () => {
        $r.push($dom.text(" "));
        $n0 = $dom.element("button");
        $dom.append($n0, $dom.text(" "));
        $n1 = $dom.element("slot");
        $dom.append($n0, $n1);
        $dom.append($n0, $dom.text(" "));
        $r.push($n0);
        $r.push($dom.text(" "));
        $a();
        $m();
        $s();
      },
      h: () => {
        let $c0 = $dom.firstElementChild($shadow);
        $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
        {
          let $c1 = $dom.firstElementChild($n0);
          $n1 = $c1; $c1 = $dom.nextElementSibling($c1);
        }
        $s();
      },
      u: ($p) => { [, , variant = 'primary', disabled = false] = $p; $a(); },
      r: () => { $n0 = $n1 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});