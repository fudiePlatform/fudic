import { FudicElement } from '@fudic/core';

customElements.define("app-list", class extends FudicElement {
  static c($props) {
    let $n0;
    const $r = [];
    const $d = []; // teardowns
    let [$dom, $shadow, rows, empty = 'Sin elementos'] = $props;

    let $k0 = [];
    let $x0 = -1;
    const $b0 = ($parent, $anchor, empty) => {
      let $n1, $n2, $n3, $n4;
      const $r = [];
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      const $a = () => {
        let $v;
        $v = String((empty) ?? '');
        if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n4, $v); }
      };
      const $s = () => {};
      const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: undefined,
        c: () => {
          $n1 = $dom.text(" ");
          $r.push($n1);
          $n2 = $dom.element("p");
          $dom.setAttr($n2, 'class', ["empty"].filter(Boolean).join(' '));
          $n4 = $dom.text('');
          $dom.append($n2, $n4);
          $r.push($n2);
          $n3 = $dom.text(" ");
          $r.push($n3);
          $a();
        },
        h: ($c) => {
          $n1 = $dom.previousSibling($c);
          $r.push($n1);
          $n2 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n2);
          $n4 = $dom.lastChild($n2);
          $n3 = $dom.lastChild($parent);
          $r.push($n3);
          return $c;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of $r) $mv($anchor, $n);
        },
        s: $s,
        u: (...$p) => { [empty] = $p; $a(); },
        move: ($ref) => {
          $ref = $mv($ref, $n3);
          $ref = $mv($ref, $n2);
          $ref = $mv($ref, $n1);
          return $ref;
        },
        r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
      };
    };
    const $b1 = ($parent, $anchor, rows) => {
      let $n5, $n6, $n7, $n8;
      const $r = [];
      const $d = []; // teardowns
      let $k1 = [];
      const $b2 = ($parent, $anchor, row) => {
        let $n9, $n10, $n11, $n12, $n13, $n14;
        const $r = [];
        const $d = []; // teardowns
        const $w = []; // last applied, per value write
        let $k2 = [];
        const $b3 = ($parent, $anchor, mark) => {
          let $n15, $n16, $n17, $n18;
          const $r = [];
          const $d = []; // teardowns
          const $w = []; // last applied, per value write
          const $a = () => {
            let $v;
            $v = String((mark) ?? '');
            if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n18, $v); }
          };
          const $s = () => {};
          const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
          return {
            key: mark,
            c: () => {
              $n15 = $dom.text(" ");
              $r.push($n15);
              $n16 = $dom.element("span");
              $dom.setAttr($n16, 'class', ["tag"].filter(Boolean).join(' '));
              $n18 = $dom.text('');
              $dom.append($n16, $n18);
              $r.push($n16);
              $n17 = $dom.text(" ");
              $r.push($n17);
              $a();
            },
            h: ($c) => {
              $n15 = $dom.previousSibling($c);
              $r.push($n15);
              $n16 = $c; $c = $dom.nextElementSibling($c);
              $r.push($n16);
              $n18 = $dom.lastChild($n16);
              $n17 = $dom.lastChild($parent);
              $r.push($n17);
              return $c;
            },
            m: ($ref = $anchor) => {
              $anchor = $ref;
              for (const $n of $r) $mv($anchor, $n);
            },
            s: $s,
            u: (...$p) => { [mark] = $p; $a(); },
            move: ($ref) => {
              $ref = $mv($ref, $n17);
              $ref = $mv($ref, $n16);
              $ref = $mv($ref, $n15);
              return $ref;
            },
            r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
          };
        };
        const $u2 = () => {
          const $prev = new Map();
          const $gone = [];
          for (const $i of $k2) { if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }
          const $next = [];
          for (const mark of row.tags) {
            const $ky = mark;
            const $hit = $prev.get($ky);
            if ($hit !== undefined) { $prev.delete($ky); $hit.u(mark); $next.push($hit); }
            else { const $i = $b3($n10, $n13, mark); $i.c(); $i.m(); $i.s(); $next.push($i); }
          }
          for (const $i of $prev.values()) $gone.push($i);
          for (const $i of $gone) $i.r();
          for (let $j = $next.length - 1, $ref = $n13; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
          $k2 = $next;
        };
        const $a = () => {
          let $v;
          $v = String((row.label) ?? '');
          if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n14, $v); }
        };
        const $s = () => {};
        const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: row.id,
          c: () => {
            $n9 = $dom.text(" ");
            $r.push($n9);
            $n10 = $dom.element("li");
            $dom.setAttr($n10, 'class', ["row"].filter(Boolean).join(' '));
            $dom.append($n10, $dom.text(" "));
            $n12 = $dom.element("span");
            $n14 = $dom.text('');
            $dom.append($n12, $n14);
            $dom.append($n10, $n12);
            $dom.append($n10, $dom.text(" "));
            for (const mark of row.tags) {
              const $i = $b3($n10, null, mark);
              $i.c();
              $i.m();
              $i.s();
              $k2.push($i);
            }
            $n13 = $dom.text(" ");
            $dom.append($n10, $n13);
            $r.push($n10);
            $n11 = $dom.text(" ");
            $r.push($n11);
            $a();
          },
          h: ($c) => {
            $n9 = $dom.previousSibling($c);
            $r.push($n9);
            $n10 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n10);
            {
              let $c1 = $dom.firstElementChild($n10);
              $n12 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n14 = $dom.lastChild($n12);
              for (const mark of row.tags) {
                const $i = $b3($n10, null, mark);
                $c1 = $i.h($c1);
                $i.s();
                $k2.push($i);
              }
              $n13 = $dom.lastChild($n10);
            }
            $n11 = $dom.lastChild($parent);
            $r.push($n11);
            return $c;
          },
          m: ($ref = $anchor) => {
            $anchor = $ref;
            for (const $n of $r) $mv($anchor, $n);
          },
          s: $s,
          u: (...$p) => { [row] = $p; $a(); $u2(); },
          move: ($ref) => {
            $ref = $mv($ref, $n11);
            $ref = $mv($ref, $n10);
            $ref = $mv($ref, $n9);
            return $ref;
          },
          r: () => { $d.forEach(($f) => $f()); $k2.forEach(($i) => $i.r()); for (const $n of $r) $dom.remove($n); },
        };
      };
      const $u1 = () => {
        const $prev = new Map();
        const $gone = [];
        for (const $i of $k1) { if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }
        const $next = [];
        for (const row of rows) {
          const $ky = row.id;
          const $hit = $prev.get($ky);
          if ($hit !== undefined) { $prev.delete($ky); $hit.u(row); $next.push($hit); }
          else { const $i = $b2($n6, $n8, row); $i.c(); $i.m(); $i.s(); $next.push($i); }
        }
        for (const $i of $prev.values()) $gone.push($i);
        for (const $i of $gone) $i.r();
        for (let $j = $next.length - 1, $ref = $n8; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
        $k1 = $next;
      };
      const $a = () => {};
      const $s = () => {};
      const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: undefined,
        c: () => {
          $n5 = $dom.text(" ");
          $r.push($n5);
          $n6 = $dom.element("ul");
          $dom.setAttr($n6, 'class', ["list"].filter(Boolean).join(' '));
          $dom.append($n6, $dom.text(" "));
          for (const row of rows) {
            const $i = $b2($n6, null, row);
            $i.c();
            $i.m();
            $i.s();
            $k1.push($i);
          }
          $n8 = $dom.text(" ");
          $dom.append($n6, $n8);
          $r.push($n6);
          $n7 = $dom.text(" ");
          $r.push($n7);
          $a();
        },
        h: ($c) => {
          $n5 = $dom.previousSibling($c);
          $r.push($n5);
          $n6 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n6);
          {
            let $c1 = $dom.firstElementChild($n6);
            for (const row of rows) {
              const $i = $b2($n6, null, row);
              $c1 = $i.h($c1);
              $i.s();
              $k1.push($i);
            }
            $n8 = $dom.lastChild($n6);
          }
          $n7 = $dom.lastChild($parent);
          $r.push($n7);
          return $c;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of $r) $mv($anchor, $n);
        },
        s: $s,
        u: (...$p) => { [rows] = $p; $a(); $u1(); },
        move: ($ref) => {
          $ref = $mv($ref, $n7);
          $ref = $mv($ref, $n6);
          $ref = $mv($ref, $n5);
          return $ref;
        },
        r: () => { $d.forEach(($f) => $f()); $k1.forEach(($i) => $i.r()); for (const $n of $r) $dom.remove($n); },
      };
    };
    const $q0 = () => (rows === undefined || rows.length === 0 ? 0 : 1);
    const $f0 = ($x, $an) => $x === 0 ? $b0($shadow, $an, empty) : $x === 1 ? $b1($shadow, $an, rows) : null;
    const $g0 = ($x, $i) => { if ($x === 0) $i.u(empty); else if ($x === 1) $i.u(rows); };
    const $u0 = () => {
      const $q = $q0();
      if ($q === $x0) { for (const $i of $k0) $g0($q, $i); return; }
      for (const $i of $k0) $i.r();
      $k0 = [];
      $x0 = $q;
      const $i = $f0($q, $n0);
      if ($i !== null) { $i.c(); $i.m(); $i.s(); $k0.push($i); }
    };
    const $m = () => {
      for (const $n of $r) $dom.append($shadow, $n);
      for (const $i of $k0) $i.m($n0);
    };
    const $s = () => {};
    const $a = () => {};

    return {
      c: () => {
        $r.push($dom.text(" "));
        {
          const $q = $q0();
          const $i = $f0($q, null);
          if ($i !== null) { $i.c(); $i.s(); $k0.push($i); }
          $x0 = $q;
        }
        $n0 = $dom.text(" ");
        $r.push($n0);
        $a();
        $m();
        $s();
      },
      h: () => {
        let $c0 = $dom.firstElementChild($shadow);
        {
          const $q = $q0();
          const $i = $f0($q, null);
          if ($i !== null) { $c0 = $i.h($c0); $i.s(); $k0.push($i); }
          $x0 = $q;
        }
        $n0 = $dom.lastChild($shadow);
        $s();
      },
      u: ($p) => { if (2 in $p) rows = $p[2]; if (3 in $p) empty = $p[3] === undefined ? 'Sin elementos' : $p[3]; $a(); $u0(); },
      r: () => { $k0.forEach(($i) => $i.r()); $n0 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});