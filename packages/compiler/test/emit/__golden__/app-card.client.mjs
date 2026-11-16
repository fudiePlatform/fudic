import { FudicElement, subscribe as $sub, written as $written, live as $live, owned as $owned } from '@fudic/core';
import { signal } from '@fudic/core';
import { template as $template } from '@fudic/dom';
const $T0 = $template` <div class="body"><slot></slot></div> <!---->`;
const $T1 = $template` Cerrar <!---->`;
const $T2 = $template` Abrir <!---->`;
const $T3 = $template`<article class="card"><header><h2></h2></header> <!----> <app-button data-fud-adopt="app-button"> <!----> </app-button></article>`;

customElements.define("app-card", class extends FudicElement {
  static c($props) {
    const [$ctl, $owns] = $owned(() => {
      let $n0, $n1, $n2, $n3, $n4, $n5, $n11, $n16, $n17;
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      let [$dom, $shadow, title, variant] = $props; variant ??= ('default');
      const expanded = signal(false);
      function toggle() {
    expanded.set(!expanded());
  }

      let $k0 = [];
      let $x0 = -1;
      const $b0 = ($parent, $anchor) => {
        let $n6, $n7, $n8, $n9, $n10;
        const $r = [];
        const $d = []; // teardowns
        const $a = () => {};
        const $s = () => {};
        const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: undefined,
          c: () => {
            const $f = $T0();
            let $c = $dom.firstElementChild($f);
            $n7 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n7);
            {
              let $c1 = $dom.firstElementChild($n7);
              $n10 = $c1; $c1 = $dom.nextElementSibling($c1);
            }
            $n9 = $dom.lastChild($f);
            $r.push($n9);
            $n8 = $dom.previousSibling($n9);
            $r.push($n8);
            $n6 = $dom.previousSibling($n7);
            $r.push($n6);
            $a();
          },
          h: ($c) => {
            $n7 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n7);
            {
              let $c1 = $dom.firstElementChild($n7);
              $n10 = $c1; $c1 = $dom.nextElementSibling($c1);
            }
            return $c;
          },
          t: ($e) => {
            $n9 = $e === null ? $dom.lastChild($parent) : $dom.previousSibling($e);
            $r.push($n9);
            $n8 = $dom.previousSibling($n9);
            $r.push($n8);
            $n6 = $dom.previousSibling($n7);
            $r.push($n6);
            $e = $n6;
            return $e;
          },
          m: ($ref = $anchor) => {
            $anchor = $ref;
            for (const $n of [$n6, $n7, $n8, $n9]) $mv($anchor, $n);
          },
          s: $s,
          u: () => { $a(); },
          move: ($ref) => {
            $ref = $mv($ref, $n9);
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
        let $n12, $n13;
        const $r = [];
        const $d = []; // teardowns
        const $a = () => {};
        const $s = () => {};
        const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: undefined,
          c: () => {
            const $f = $T1();
            let $c = $dom.firstElementChild($f);
            $n13 = $dom.lastChild($f);
            $r.push($n13);
            $n12 = $dom.previousSibling($n13);
            $r.push($n12);
            $a();
          },
          h: ($c) => {
            return $c;
          },
          t: ($e) => {
            $n13 = $e === null ? $dom.lastChild($parent) : $dom.previousSibling($e);
            $r.push($n13);
            $n12 = $dom.previousSibling($n13);
            $r.push($n12);
            $e = $n12;
            return $e;
          },
          m: ($ref = $anchor) => {
            $anchor = $ref;
            for (const $n of [$n12, $n13]) $mv($anchor, $n);
          },
          s: $s,
          u: () => { $a(); },
          move: ($ref) => {
            $ref = $mv($ref, $n13);
            $ref = $mv($ref, $n12);
            return $ref;
          },
          r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
        };
      };
      const $b2 = ($parent, $anchor) => {
        let $n14, $n15;
        const $r = [];
        const $d = []; // teardowns
        const $a = () => {};
        const $s = () => {};
        const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: undefined,
          c: () => {
            const $f = $T2();
            let $c = $dom.firstElementChild($f);
            $n15 = $dom.lastChild($f);
            $r.push($n15);
            $n14 = $dom.previousSibling($n15);
            $r.push($n14);
            $a();
          },
          h: ($c) => {
            return $c;
          },
          t: ($e) => {
            $n15 = $e === null ? $dom.lastChild($parent) : $dom.previousSibling($e);
            $r.push($n15);
            $n14 = $dom.previousSibling($n15);
            $r.push($n14);
            $e = $n14;
            return $e;
          },
          m: ($ref = $anchor) => {
            $anchor = $ref;
            for (const $n of [$n14, $n15]) $mv($anchor, $n);
          },
          s: $s,
          u: () => { $a(); },
          move: ($ref) => {
            $ref = $mv($ref, $n15);
            $ref = $mv($ref, $n14);
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
        const $i = $f1($q, $n11);
        if ($i !== null) { $i.c(); $i.m(); $i.s(); $k1.push($i); }
      };
      const $s = () => {
        $n3 && $d.push($dom.event($n3, "press", toggle));
        $d.push($sub(expanded, $u));
        if ($written(expanded)) $u();
      };
      const $a = () => {
        let $v;
        $v = !!((variant === 'highlight'));
        if ($v !== $w[0]) { $w[0] = $v; $dom.toggleClass($n0, "highlight", $v); }
        $v = String((title) ?? '');
        if ($v !== $w[1]) { $w[1] = $v; $dom.setText($n5, $v); }
      };
      const $u = () => { $a(); $u0(); $u1(); };

      return {
        c: () => {
          $dom.append($shadow, $T3());
          let $c0 = $dom.firstElementChild($shadow);
          $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
          {
            let $c1 = $dom.firstElementChild($n0);
            $n1 = $c1; $c1 = $dom.nextElementSibling($c1);
            {
              let $c2 = $dom.firstElementChild($n1);
              $n4 = $c2; $c2 = $dom.nextElementSibling($c2);
              $n5 = $dom.lastChild($n4);
              $n5 = $dom.textAt($n4, $n5, null);
            }
            {
              const $q = $q0();
              const $i = $f0($q, null);
              if ($i !== null) { $i.c(); $i.s(); $k0.push($i); }
              $x0 = $q;
            }
            $n3 = $c1; $c1 = $dom.nextElementSibling($c1);
            $live($n3, ["ghost"], $shadow);
            {
              const $q = $q1();
              const $i = $f1($q, null);
              if ($i !== null) { $i.c(); $i.s(); $k1.push($i); }
              $x1 = $q;
            }
            $n11 = $dom.lastChild($n3);
            for (const $i of $k1) $i.m($n11);
            $n2 = $dom.previousSibling($n3);
            for (const $i of $k0) $i.m($n2);
          }
          $a();
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
              $n5 = $dom.textAt($n4, $n5, null);
            }
            {
              const $q = $q0();
              const $i = $f0($q, null);
              if ($i !== null) { $c1 = $i.h($c1); $i.s(); $k0.push($i); }
              $x0 = $q;
            }
            $n3 = $c1; $c1 = $dom.nextElementSibling($c1);
            {
              const $q = $q1();
              const $i = $f1($q, null);
              if ($i !== null) { $i.h(null); $i.s(); $k1.push($i); }
              $x1 = $q;
            }
            $n11 = $dom.lastChild($n3);
            $n16 = $n11;
            for (let $j = $k1.length - 1; $j >= 0; $j -= 1) $n16 = $k1[$j].t($n16);
            $n2 = $dom.previousSibling($n3);
            $n17 = $n2;
            for (let $j = $k0.length - 1; $j >= 0; $j -= 1) $n17 = $k0[$j].t($n17);
          }
          $s();
        },
        u: ($p) => { if (2 in $p) title = $p[2]; if (3 in $p) variant = $p[3] ?? ('default'); $u(); },
        r: () => { $k0.forEach(($i) => $i.r()); $k1.forEach(($i) => $i.r()); $n0 = $n1 = $n2 = $n3 = $n4 = $n5 = $n11 = $n16 = $n17 = $shadow = null; $d.forEach((d) => d()); $owns.forEach((d) => d()); },
      };
    });
    return $ctl;
  }
});