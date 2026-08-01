import { FudicElement } from '@fudic/core';
import { signal } from '@fudic/core';

customElements.define("app-card", class extends FudicElement {
  static c($props) {
    let $n0, $n1, $n2, $n3, $n4, $n5, $n6, $n7, $n8, $n9, $n10, $n11, $n12, $n13, $n14, $n15, $n16, $n17, $n18, $n19, $n20, $n21, $n22;
    const $r = [];
    const $d = []; // teardowns
    let [$dom, $shadow, title, variant = 'default'] = $props;
    const expanded = signal(false);
    function toggle() {
      expanded.set(!expanded.peek());
    }

    const m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const s = () => {};

    return {
      c: () => {
        $n0 = $dom.text(" ");
        $r.push($n0);
        $n1 = $dom.element("article");
        $dom.setAttr($n1, 'class', ["card", (variant === 'highlight') && "highlight"].filter(Boolean).join(' '));
        $n2 = $dom.text(" ");
        $dom.append($n1, $n2);
        $n3 = $dom.element("header");
        $n4 = $dom.text(" ");
        $dom.append($n3, $n4);
        $n5 = $dom.element("h2");
        $n6 = $dom.text(String((title) ?? ''));
        $dom.append($n5, $n6);
        $dom.append($n3, $n5);
        $n7 = $dom.text(" ");
        $dom.append($n3, $n7);
        $dom.append($n1, $n3);
        $n8 = $dom.text(" ");
        $dom.append($n1, $n8);
        if (expanded.peek()) {
          $n9 = $dom.text(" ");
          $dom.append($n1, $n9);
          $n10 = $dom.element("div");
          $dom.setAttr($n10, 'class', ["body"].filter(Boolean).join(' '));
          $n11 = $dom.text(" ");
          $dom.append($n10, $n11);
          $n12 = $dom.element("slot");
          $dom.append($n10, $n12);
          $n13 = $dom.text(" ");
          $dom.append($n10, $n13);
          $dom.append($n1, $n10);
          $n14 = $dom.text(" ");
          $dom.append($n1, $n14);
        }
        $n15 = $dom.text(" ");
        $dom.append($n1, $n15);
        $n16 = $dom.element("app-button");
        $dom.setAttr($n16, 'data-adopt', "app-button");
        $n17 = $dom.text(" ");
        $dom.append($n16, $n17);
        if (expanded.peek()) {
          $n18 = $dom.text(" Cerrar ");
          $dom.append($n16, $n18);
        } else {
          $n19 = $dom.text(" Abrir ");
          $dom.append($n16, $n19);
        }
        $n20 = $dom.text(" ");
        $dom.append($n16, $n20);
        $dom.append($n1, $n16);
        $n21 = $dom.text(" ");
        $dom.append($n1, $n21);
        $r.push($n1);
        $n22 = $dom.text(" ");
        $r.push($n22);
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
          {
            let $c2 = $dom.firstChild($n3);
            $n4 = $c2; $c2 = $dom.nextSibling($c2);
            $n5 = $c2; $c2 = $dom.nextSibling($c2);
            {
              let $c3 = $dom.firstChild($n5);
              $n6 = $c3; $c3 = $dom.nextSibling($c3);
            }
            $n7 = $c2; $c2 = $dom.nextSibling($c2);
          }
          $n8 = $c1; $c1 = $dom.nextSibling($c1);
          if (expanded.peek()) {
            $n9 = $c1; $c1 = $dom.nextSibling($c1);
            $n10 = $c1; $c1 = $dom.nextSibling($c1);
            {
              let $c2 = $dom.firstChild($n10);
              $n11 = $c2; $c2 = $dom.nextSibling($c2);
              $n12 = $c2; $c2 = $dom.nextSibling($c2);
              $n13 = $c2; $c2 = $dom.nextSibling($c2);
            }
            $n14 = $c1; $c1 = $dom.nextSibling($c1);
          }
          $n15 = $c1; $c1 = $dom.nextSibling($c1);
          $n16 = $c1; $c1 = $dom.nextSibling($c1);
          {
            let $c2 = $dom.firstChild($n16);
            $n17 = $c2; $c2 = $dom.nextSibling($c2);
            if (expanded.peek()) {
              $n18 = $c2; $c2 = $dom.nextSibling($c2);
            } else {
              $n19 = $c2; $c2 = $dom.nextSibling($c2);
            }
            $n20 = $c2; $c2 = $dom.nextSibling($c2);
          }
          $n21 = $c1; $c1 = $dom.nextSibling($c1);
        }
        $n22 = $c0; $c0 = $dom.nextSibling($c0);
        s();
      },
      r: () => { $n0 = $n1 = $n2 = $n3 = $n4 = $n5 = $n6 = $n7 = $n8 = $n9 = $n10 = $n11 = $n12 = $n13 = $n14 = $n15 = $n16 = $n17 = $n18 = $n19 = $n20 = $n21 = $n22 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});