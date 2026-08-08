import { FudicElement } from '@fudic/core';
import { signal } from '@fudic/core';

customElements.define("app-card", class extends FudicElement {
  static c($props) {
    let $n0, $n1, $n2, $n3, $n4, $n5, $n6;
    const $r = [];
    const $d = []; // teardowns
    const $w = []; // last applied, per value write
    let [$dom, $shadow, title, variant = 'default'] = $props;
    const expanded = signal(false);
    function toggle() {
      expanded.set(!expanded.peek());
    }

    const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const $s = () => {};
    const $a = () => {
      let $v;
      $v = ["card", (variant === 'highlight') && "highlight"].filter(Boolean).join(' ');
      if ($v !== $w[0]) { $w[0] = $v; $dom.setAttr($n0, 'class', $v); }
      $v = String((title) ?? '');
      if ($v !== $w[1]) { $w[1] = $v; $dom.setText($n3, $v); }
    };

    return {
      c: () => {
        $r.push($dom.text(" "));
        $n0 = $dom.element("article");
        $dom.append($n0, $dom.text(" "));
        $n1 = $dom.element("header");
        $dom.append($n1, $dom.text(" "));
        $n2 = $dom.element("h2");
        $n3 = $dom.text('');
        $dom.append($n2, $n3);
        $dom.append($n1, $n2);
        $dom.append($n1, $dom.text(" "));
        $dom.append($n0, $n1);
        $dom.append($n0, $dom.text(" "));
        if (expanded.peek()) {
          $dom.append($n0, $dom.text(" "));
          $n4 = $dom.element("div");
          $dom.setAttr($n4, 'class', ["body"].filter(Boolean).join(' '));
          $dom.append($n4, $dom.text(" "));
          $n5 = $dom.element("slot");
          $dom.append($n4, $n5);
          $dom.append($n4, $dom.text(" "));
          $dom.append($n0, $n4);
          $dom.append($n0, $dom.text(" "));
        }
        $dom.append($n0, $dom.text(" "));
        $n6 = $dom.element("app-button");
        $dom.setAttr($n6, 'data-adopt', "app-button");
        $dom.setAttr($n6, "variant", "ghost");
        $dom.append($n6, $dom.text(" "));
        if (expanded.peek()) {
          $dom.append($n6, $dom.text(" Cerrar "));
        } else {
          $dom.append($n6, $dom.text(" Abrir "));
        }
        $dom.append($n6, $dom.text(" "));
        $dom.append($n0, $n6);
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
          {
            let $c2 = $dom.firstElementChild($n1);
            $n2 = $c2; $c2 = $dom.nextElementSibling($c2);
            $n3 = $dom.lastChild($n2);
          }
          if (expanded.peek()) {
            $n4 = $c1; $c1 = $dom.nextElementSibling($c1);
            {
              let $c2 = $dom.firstElementChild($n4);
              $n5 = $c2; $c2 = $dom.nextElementSibling($c2);
            }
          }
          $n6 = $c1; $c1 = $dom.nextElementSibling($c1);
        }
        $s();
      },
      u: ($p) => { [, , title, variant = 'default'] = $p; $a(); },
      r: () => { $n0 = $n1 = $n2 = $n3 = $n4 = $n5 = $n6 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});