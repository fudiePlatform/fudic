import { FudicElement } from '@fudic/core';
import { template as $template } from '@fudic/dom';
const $T0 = $template` <span class="tag"></span> <!---->`;
const $T1 = $template` <li class="row"> <span></span> <!----> </li> <!---->`;
const $T2 = $template` <li class="empty"></li> <!---->`;
const $T3 = $template`<ul class="list"> <!----> </ul>`;

customElements.define("app-list", class extends FudicElement {
  static c($props) {
    let $n0, $n1, $n20;
    const $d = []; // teardowns
    let [$dom, $shadow, rows, empty] = $props; rows ??= ([]); empty ??= ('Sin elementos');

    let $k0 = [];
    const $b0 = ($parent, $anchor, row) => {
      let $n2, $n3, $n4, $n5, $n6, $n7, $n8, $n14;
      const $r = [];
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      let $k1 = [];
      const $b2 = ($parent, $anchor, mark) => {
        let $n9, $n10, $n11, $n12, $n13;
        const $r = [];
        const $d = []; // teardowns
        const $w = []; // last applied, per value write
        const $a = () => {
          let $v;
          $v = String((mark) ?? '');
          if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n13, $v); }
        };
        const $s = () => {};
        const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: mark,
          c: () => {
            const $f = $T0();
            let $c = $dom.firstElementChild($f);
            $n10 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n10);
            $n13 = $dom.lastChild($n10);
            $n13 = $dom.textAt($n10, $n13, null);
            $n12 = $dom.lastChild($f);
            $r.push($n12);
            $n11 = $dom.previousSibling($n12);
            $r.push($n11);
            $n9 = $dom.previousSibling($n10);
            $r.push($n9);
            $a();
          },
          h: ($c) => {
            $n10 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n10);
            $n13 = $dom.lastChild($n10);
            $n13 = $dom.textAt($n10, $n13, null);
            return $c;
          },
          t: ($e) => {
            $n12 = $e === null ? $dom.lastChild($parent) : $dom.previousSibling($e);
            $r.push($n12);
            $n11 = $dom.previousSibling($n12);
            $r.push($n11);
            $n9 = $dom.previousSibling($n10);
            $r.push($n9);
            $e = $n9;
            return $e;
          },
          m: ($ref = $anchor) => {
            $anchor = $ref;
            for (const $n of [$n9, $n10, $n11, $n12]) $mv($anchor, $n);
          },
          s: $s,
          u: (...$p) => { [mark] = $p; $a(); },
          move: ($ref) => {
            $ref = $mv($ref, $n12);
            $ref = $mv($ref, $n11);
            $ref = $mv($ref, $n10);
            $ref = $mv($ref, $n9);
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
          else { const $i = $b2($n3, $n7, mark); $i.c(); $i.m(); $i.s(); $next.push($i); }
        }
        for (const $i of $prev.values()) $gone.push($i);
        for (const $i of $gone) $i.r();
        for (let $j = $next.length - 1, $ref = $n7; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
        $k1 = $next;
      };
      const $a = () => {
        let $v;
        $v = String((row.label) ?? '');
        if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n8, $v); }
      };
      const $s = () => {};
      const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: row.id,
        c: () => {
          const $f = $T1();
          let $c = $dom.firstElementChild($f);
          $n3 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n3);
          {
            let $c1 = $dom.firstElementChild($n3);
            $n6 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n8 = $dom.lastChild($n6);
            $n8 = $dom.textAt($n6, $n8, null);
            for (const mark of row.tags) {
              const $i = $b2($n3, null, mark);
              $i.c();
              $i.s();
              $k1.push($i);
            }
            $n7 = $dom.lastChild($n3);
            for (const $i of $k1) $i.m($n7);
          }
          $n5 = $dom.lastChild($f);
          $r.push($n5);
          $n4 = $dom.previousSibling($n5);
          $r.push($n4);
          $n2 = $dom.previousSibling($n3);
          $r.push($n2);
          $a();
        },
        h: ($c) => {
          $n3 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n3);
          {
            let $c1 = $dom.firstElementChild($n3);
            $n6 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n8 = $dom.lastChild($n6);
            $n8 = $dom.textAt($n6, $n8, null);
            for (const mark of row.tags) {
              const $i = $b2($n3, null, mark);
              $c1 = $i.h($c1);
              $i.s();
              $k1.push($i);
            }
            $n7 = $dom.lastChild($n3);
            $n14 = $n7;
            for (let $j = $k1.length - 1; $j >= 0; $j -= 1) $n14 = $k1[$j].t($n14);
          }
          return $c;
        },
        t: ($e) => {
          $n5 = $e === null ? $dom.lastChild($parent) : $dom.previousSibling($e);
          $r.push($n5);
          $n4 = $dom.previousSibling($n5);
          $r.push($n4);
          $n2 = $dom.previousSibling($n3);
          $r.push($n2);
          $e = $n2;
          return $e;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of [$n2, $n3, $n4, $n5]) $mv($anchor, $n);
        },
        s: $s,
        u: (...$p) => { [row] = $p; $a(); $u1(); },
        move: ($ref) => {
          $ref = $mv($ref, $n5);
          $ref = $mv($ref, $n4);
          $ref = $mv($ref, $n3);
          $ref = $mv($ref, $n2);
          return $ref;
        },
        r: () => { $d.forEach(($f) => $f()); $k1.forEach(($i) => $i.r()); for (const $n of $r) $dom.remove($n); },
      };
    };
    const $b1 = ($parent, $anchor, empty) => {
      let $n15, $n16, $n17, $n18, $n19;
      const $r = [];
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      const $a = () => {
        let $v;
        $v = String((empty) ?? '');
        if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n19, $v); }
      };
      const $s = () => {};
      const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: undefined,
        z: true,
        c: () => {
          const $f = $T2();
          let $c = $dom.firstElementChild($f);
          $n16 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n16);
          $n19 = $dom.lastChild($n16);
          $n19 = $dom.textAt($n16, $n19, null);
          $n18 = $dom.lastChild($f);
          $r.push($n18);
          $n17 = $dom.previousSibling($n18);
          $r.push($n17);
          $n15 = $dom.previousSibling($n16);
          $r.push($n15);
          $a();
        },
        h: ($c) => {
          $n16 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n16);
          $n19 = $dom.lastChild($n16);
          $n19 = $dom.textAt($n16, $n19, null);
          return $c;
        },
        t: ($e) => {
          $n18 = $e === null ? $dom.lastChild($parent) : $dom.previousSibling($e);
          $r.push($n18);
          $n17 = $dom.previousSibling($n18);
          $r.push($n17);
          $n15 = $dom.previousSibling($n16);
          $r.push($n15);
          $e = $n15;
          return $e;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of [$n15, $n16, $n17, $n18]) $mv($anchor, $n);
        },
        s: $s,
        u: (...$p) => { [empty] = $p; $a(); },
        move: ($ref) => {
          $ref = $mv($ref, $n18);
          $ref = $mv($ref, $n17);
          $ref = $mv($ref, $n16);
          $ref = $mv($ref, $n15);
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
    const $s = () => {};
    const $a = () => {};

    return {
      c: () => {
        $dom.append($shadow, $T3());
        let $c0 = $dom.firstElementChild($shadow);
        $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
        {
          let $c1 = $dom.firstElementChild($n0);
          for (const row of rows) {
            const $i = $b0($n0, null, row);
            $i.c();
            $i.s();
            $k0.push($i);
          }
          if ($k0.length === 0) { const $i = $b1($n0, null, empty); $i.c(); $i.s(); $k0.push($i); }
          $n1 = $dom.lastChild($n0);
          for (const $i of $k0) $i.m($n1);
        }
        $a();
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
          $n20 = $n1;
          for (let $j = $k0.length - 1; $j >= 0; $j -= 1) $n20 = $k0[$j].t($n20);
        }
        $s();
      },
      u: ($p) => { if (2 in $p) rows = $p[2] ?? ([]); if (3 in $p) empty = $p[3] ?? ('Sin elementos'); $a(); $u0(); },
      r: () => { $k0.forEach(($i) => $i.r()); $n0 = $n1 = $n20 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});