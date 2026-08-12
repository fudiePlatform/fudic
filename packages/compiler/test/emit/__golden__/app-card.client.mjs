import { FudicElement } from '@fudic/core';
import { signal } from '@fudic/core';

customElements.define("app-card", class extends FudicElement {
  static c($props) {
    let $n0, $n1, $n2, $n3, $n4, $n5, $n10;
    const $r = [];
    const $d = []; // teardowns
    const $w = []; // last applied, per value write
    let [$dom, $shadow, title, variant = 'default'] = $props;
    const expanded = signal(false);
    function toggle() {
      expanded.set(!expanded());
    }

    let $k0 = [];
    let $x0 = -1;
    const $b0 = ($parent, $anchor) => {
      let $n6, $n7, $n8, $n9;
      const $r = [];
      const $d = []; // teardowns
      const $a = () => {};
      const $s = () => {};
      const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: undefined,
        c: () => {
          $n6 = $dom.text(" ");
          $r.push($n6);
          $n7 = $dom.element("div");
          $dom.setAttr($n7, 'class', ["body"].filter(Boolean).join(' '));
          $dom.append($n7, $dom.text(" "));
          $n9 = $dom.element("slot");
          $dom.append($n7, $n9);
          $dom.append($n7, $dom.text(" "));
          $r.push($n7);
          $n8 = $dom.text(" ");
          $r.push($n8);
          $a();
        },
        h: ($c) => {
          $n6 = $dom.previousSibling($c);
          $r.push($n6);
          $n7 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n7);
          {
            let $c1 = $dom.firstElementChild($n7);
            $n9 = $c1; $c1 = $dom.nextElementSibling($c1);
          }
          $n8 = $dom.previousSibling($c);
          $r.push($n8);
          return $c;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of $r) $mv($anchor, $n);
        },
        s: $s,
        u: () => { $a(); },
        move: ($ref) => {
          $ref = $mv($ref, $n8);
          $ref = $mv($ref, $n7);
          $ref = $mv($ref, $n6);
          return $ref;
        },
        r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
      };
    };
    const $q0 = () => (expanded() ? 0 : -1);
    const $f0 = ($x, $an) => $x === 0 ? $b0($n0, $an) : null;
    const $g0 = ($x, $i) => $i.u();
    const $u0 = () => {
      const $q = $q0();
      if ($q === $x0) { for (const $i of $k0) $g0($q, $i); return; }
      for (const $i of $k0) $i.r();
      $k0 = [];
      $x0 = $q;
      const $i = $f0($q, $n2);
      if ($i !== null) { $i.c(); $i.m(); $i.s(); $k0.push($i); }
    };
    let $k1 = [];
    let $x1 = -1;
    const $b1 = ($parent, $anchor) => {
      let $n11;
      const $r = [];
      const $d = []; // teardowns
      const $a = () => {};
      const $s = () => {};
      const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: undefined,
        c: () => {
          $n11 = $dom.text(" Cerrar ");
          $r.push($n11);
          $a();
        },
        h: ($c) => {
          $n11 = $dom.lastChild($parent);
          $r.push($n11);
          return $c;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of $r) $mv($anchor, $n);
        },
        s: $s,
        u: () => { $a(); },
        move: ($ref) => {
          $ref = $mv($ref, $n11);
          return $ref;
        },
        r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
      };
    };
    const $b2 = ($parent, $anchor) => {
      let $n12;
      const $r = [];
      const $d = []; // teardowns
      const $a = () => {};
      const $s = () => {};
      const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: undefined,
        c: () => {
          $n12 = $dom.text(" Abrir ");
          $r.push($n12);
          $a();
        },
        h: ($c) => {
          $n12 = $dom.lastChild($parent);
          $r.push($n12);
          return $c;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of $r) $mv($anchor, $n);
        },
        s: $s,
        u: () => { $a(); },
        move: ($ref) => {
          $ref = $mv($ref, $n12);
          return $ref;
        },
        r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
      };
    };
    const $q1 = () => (expanded() ? 0 : 1);
    const $f1 = ($x, $an) => $x === 0 ? $b1($n3, $an) : $x === 1 ? $b2($n3, $an) : null;
    const $g1 = ($x, $i) => $i.u();
    const $u1 = () => {
      const $q = $q1();
      if ($q === $x1) { for (const $i of $k1) $g1($q, $i); return; }
      for (const $i of $k1) $i.r();
      $k1 = [];
      $x1 = $q;
      const $i = $f1($q, $n10);
      if ($i !== null) { $i.c(); $i.m(); $i.s(); $k1.push($i); }
    };
    const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const $s = () => {
      $n3 && $d.push($dom.event($n3, "press", toggle));
    };
    const $a = () => {
      let $v;
      $v = ["card", (variant === 'highlight') && "highlight"].filter(Boolean).join(' ');
      if ($v !== $w[0]) { $w[0] = $v; $dom.setAttr($n0, 'class', $v); }
      $v = String((title) ?? '');
      if ($v !== $w[1]) { $w[1] = $v; $dom.setText($n5, $v); }
    };

    return {
      c: () => {
        $r.push($dom.text(" "));
        $n0 = $dom.element("article");
        $dom.append($n0, $dom.text(" "));
        $n1 = $dom.element("header");
        $dom.append($n1, $dom.text(" "));
        $n4 = $dom.element("h2");
        $n5 = $dom.text('');
        $dom.append($n4, $n5);
        $dom.append($n1, $n4);
        $dom.append($n1, $dom.text(" "));
        $dom.append($n0, $n1);
        $dom.append($n0, $dom.text(" "));
        {
          const $q = $q0();
          const $i = $f0($q, null);
          if ($i !== null) { $i.c(); $i.m(); $i.s(); $k0.push($i); }
          $x0 = $q;
        }
        $n2 = $dom.text(" ");
        $dom.append($n0, $n2);
        $n3 = $dom.element("app-button");
        $dom.setAttr($n3, 'data-fud-adopt', "app-button");
        $dom.setAttr($n3, "variant", "ghost");
        $dom.append($n3, $dom.text(" "));
        {
          const $q = $q1();
          const $i = $f1($q, null);
          if ($i !== null) { $i.c(); $i.m(); $i.s(); $k1.push($i); }
          $x1 = $q;
        }
        $n10 = $dom.text(" ");
        $dom.append($n3, $n10);
        $dom.append($n0, $n3);
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
            $n4 = $c2; $c2 = $dom.nextElementSibling($c2);
            $n5 = $dom.lastChild($n4);
          }
          {
            const $q = $q0();
            const $i = $f0($q, null);
            if ($i !== null) { $c1 = $i.h($c1); $i.s(); $k0.push($i); }
            $x0 = $q;
          }
          $n2 = $dom.previousSibling($c1);
          $n3 = $c1; $c1 = $dom.nextElementSibling($c1);
          {
            const $q = $q1();
            const $i = $f1($q, null);
            if ($i !== null) { $i.h(null); $i.s(); $k1.push($i); }
            $x1 = $q;
          }
          $n10 = $dom.lastChild($n3);
        }
        $s();
      },
      u: ($p) => { if (2 in $p) title = $p[2]; if (3 in $p) variant = $p[3] === undefined ? 'default' : $p[3]; $a(); $u0(); $u1(); },
      r: () => { $k0.forEach(($i) => $i.r()); $k1.forEach(($i) => $i.r()); $n0 = $n1 = $n2 = $n3 = $n4 = $n5 = $n10 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});