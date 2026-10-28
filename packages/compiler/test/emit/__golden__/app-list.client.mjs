import { FudicElement } from '@fudic/core';

customElements.define("app-list", class extends FudicElement {
  static c($props) {
    let $n0, $n1;
    const $r = [];
    const $d = []; // teardowns
    let [$dom, $shadow, rows, empty] = $props; rows ??= ([]); empty ??= ('Sin elementos');

    let $k0 = [];
    const $b0 = ($parent, $anchor, row) => {
      let $n2, $n3, $n4, $n5, $n6, $n7;
      const $r = [];
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      let $k1 = [];
      const $b2 = ($parent, $anchor, mark) => {
        let $n8, $n9, $n10, $n11;
        const $r = [];
        const $d = []; // teardowns
        const $w = []; // last applied, per value write
        const $a = () => {
          let $v;
          $v = String((mark) ?? '');
          if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n11, $v); }
        };
        const $s = () => {};
        const $mv = ($ref, $n) => { if (!$r.includes($n)) return $ref; if ($ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: mark,
          c: () => {
            $n8 = $dom.text(" ");
            $r.push($n8);
            $n9 = $dom.element("span");
            $dom.setAttr($n9, 'class', ["tag"].filter(Boolean).join(' '));
            $n11 = $dom.text('');
            $dom.append($n9, $n11);
            $r.push($n9);
            $n10 = $dom.text(" ");
            $r.push($n10);
            $a();
          },
          h: ($c) => {
            $n8 = $dom.previousSibling($c);
            $n9 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n9);
            $n11 = $dom.lastChild($n9);
            $n11 = $dom.textAt($n9, $n11, null);
            $n10 = $dom.lastChild($parent);
            return $c;
          },
          m: ($ref = $anchor) => {
            $anchor = $ref;
            for (const $n of $r) $mv($anchor, $n);
          },
          s: $s,
          u: (...$p) => { [mark] = $p; $a(); },
          move: ($ref) => {
            $ref = $mv($ref, $n10);
            $ref = $mv($ref, $n9);
            $ref = $mv($ref, $n8);
            return $ref;
          },
          r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
        };
      };
      const $u1 = () => {
        const $prev = new Map();
        const $gone = [];
        for (const $i of $k1) { if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }
        const $next = [];
        for (const mark of row.tags) {
          const $ky = mark;
          const $hit = $prev.get($ky);
          if ($hit !== undefined) { $prev.delete($ky); $hit.u(mark); $next.push($hit); }
          else { const $i = $b2($n3, $n6, mark); $i.c(); $i.m(); $i.s(); $next.push($i); }
        }
        for (const $i of $prev.values()) $gone.push($i);
        for (const $i of $gone) $i.r();
        for (let $j = $next.length - 1, $ref = $n6; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
        $k1 = $next;
      };
      const $a = () => {
        let $v;
        $v = String((row.label) ?? '');
        if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n7, $v); }
      };
      const $s = () => {};
      const $mv = ($ref, $n) => { if (!$r.includes($n)) return $ref; if ($ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: row.id,
        c: () => {
          $n2 = $dom.text(" ");
          $r.push($n2);
          $n3 = $dom.element("li");
          $dom.setAttr($n3, 'class', ["row"].filter(Boolean).join(' '));
          $dom.append($n3, $dom.text(" "));
          $n5 = $dom.element("span");
          $n7 = $dom.text('');
          $dom.append($n5, $n7);
          $dom.append($n3, $n5);
          $dom.append($n3, $dom.text(" "));
          for (const mark of row.tags) {
            const $i = $b2($n3, null, mark);
            $i.c();
            $i.m();
            $i.s();
            $k1.push($i);
          }
          $n6 = $dom.text(" ");
          $dom.append($n3, $n6);
          $r.push($n3);
          $n4 = $dom.text(" ");
          $r.push($n4);
          $a();
        },
        h: ($c) => {
          $n2 = $dom.previousSibling($c);
          $n3 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n3);
          {
            let $c1 = $dom.firstElementChild($n3);
            $n5 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n7 = $dom.lastChild($n5);
            $n7 = $dom.textAt($n5, $n7, null);
            for (const mark of row.tags) {
              const $i = $b2($n3, null, mark);
              $c1 = $i.h($c1);
              $i.s();
              $k1.push($i);
            }
            $n6 = $dom.lastChild($n3);
          }
          $n4 = $dom.lastChild($parent);
          return $c;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of $r) $mv($anchor, $n);
        },
        s: $s,
        u: (...$p) => { [row] = $p; $a(); $u1(); },
        move: ($ref) => {
          $ref = $mv($ref, $n4);
          $ref = $mv($ref, $n3);
          $ref = $mv($ref, $n2);
          return $ref;
        },
        r: () => { $d.forEach(($f) => $f()); $k1.forEach(($i) => $i.r()); for (const $n of $r) $dom.remove($n); },
      };
    };
    const $b1 = ($parent, $anchor, empty) => {
      let $n12, $n13, $n14, $n15;
      const $r = [];
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      const $a = () => {
        let $v;
        $v = String((empty) ?? '');
        if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n15, $v); }
      };
      const $s = () => {};
      const $mv = ($ref, $n) => { if (!$r.includes($n)) return $ref; if ($ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: undefined,
        z: true,
        c: () => {
          $n12 = $dom.text(" ");
          $r.push($n12);
          $n13 = $dom.element("li");
          $dom.setAttr($n13, 'class', ["empty"].filter(Boolean).join(' '));
          $n15 = $dom.text('');
          $dom.append($n13, $n15);
          $r.push($n13);
          $n14 = $dom.text(" ");
          $r.push($n14);
          $a();
        },
        h: ($c) => {
          $n12 = $dom.previousSibling($c);
          $n13 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n13);
          $n15 = $dom.lastChild($n13);
          $n15 = $dom.textAt($n13, $n15, null);
          $n14 = $dom.lastChild($parent);
          return $c;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of $r) $mv($anchor, $n);
        },
        s: $s,
        u: (...$p) => { [empty] = $p; $a(); },
        move: ($ref) => {
          $ref = $mv($ref, $n14);
          $ref = $mv($ref, $n13);
          $ref = $mv($ref, $n12);
          return $ref;
        },
        r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
      };
    };
    const $u0 = () => {
      const $prev = new Map();
      const $gone = [];
      let $z = null;
      for (const $i of $k0) { if ($i.z) $z = $i; else if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }
      const $next = [];
      for (const row of rows) {
        const $ky = row.id;
        const $hit = $prev.get($ky);
        if ($hit !== undefined) { $prev.delete($ky); $hit.u(row); $next.push($hit); }
        else { const $i = $b0($n0, $n1, row); $i.c(); $i.m(); $i.s(); $next.push($i); }
      }
      for (const $i of $prev.values()) $gone.push($i);
      if ($next.length === 0) { if ($z !== null) { $z.u(empty); $next.push($z); } else { const $i = $b1($n0, $n1, empty); $i.c(); $i.m(); $i.s(); $next.push($i); } } else if ($z !== null) $gone.push($z);
      for (const $i of $gone) $i.r();
      for (let $j = $next.length - 1, $ref = $n1; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
      $k0 = $next;
    };
    const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const $s = () => {};
    const $a = () => {};

    return {
      c: () => {
        $n0 = $dom.element("ul");
        $dom.setAttr($n0, 'class', ["list"].filter(Boolean).join(' '));
        $dom.append($n0, $dom.text(" "));
        for (const row of rows) {
          const $i = $b0($n0, null, row);
          $i.c();
          $i.m();
          $i.s();
          $k0.push($i);
        }
        if ($k0.length === 0) { const $i = $b1($n0, null, empty); $i.c(); $i.m(); $i.s(); $k0.push($i); }
        $n1 = $dom.text(" ");
        $dom.append($n0, $n1);
        $r.push($n0);
        $a();
        $m();
        $s();
      },
      h: () => {
        let $c0 = $dom.firstElementChild($shadow);
        $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
        {
          let $c1 = $dom.firstElementChild($n0);
          for (const row of rows) {
            const $i = $b0($n0, null, row);
            $c1 = $i.h($c1);
            $i.s();
            $k0.push($i);
          }
          if ($k0.length === 0) { const $i = $b1($n0, null, empty); $c1 = $i.h($c1); $i.s(); $k0.push($i); }
          $n1 = $dom.lastChild($n0);
        }
        $s();
      },
      u: ($p) => { if (2 in $p) rows = $p[2] ?? ([]); if (3 in $p) empty = $p[3] ?? ('Sin elementos'); $a(); $u0(); },
      r: () => { $k0.forEach(($i) => $i.r()); $n0 = $n1 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});