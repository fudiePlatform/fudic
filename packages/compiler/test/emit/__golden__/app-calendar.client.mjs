import { FudicElement, owned as $owned } from '@fudic/core';
import { emit } from '@fudic/dom';
import { template as $template } from '@fudic/dom';
const $T0 = $template` <div class="cell"> <span></span> <button>e</button> </div> <!---->`;
const $T1 = $template`<div class="grid"> <!----> </div>`;

customElements.define("app-calendar", class extends FudicElement {
  static c($props) {
    const [$ctl, $owns] = $owned(() => {
      let $n0, $n1, $n9;
      const $d = []; // teardowns
      let [$dom, $shadow, days] = $props; days ??= ([]);
      let $host = $dom.host($shadow);
      function pick(ev, day) {
    ev.preventDefault();
    emit.call($host, 'picked', day.id);
  }

      const $t0 = new WeakMap();
      let $k0 = [];
      const $b0 = ($parent, $anchor, day) => {
        let $n2, $n3, $n4, $n5, $n6, $n7, $n8;
        const $r = [];
        const $d = []; // teardowns
        const $w = []; // last applied, per value write
        const $a = () => {
          let $v;
          $v = String((day.n) ?? '');
          if ($v !== $w[0] || !(0 in $w)) { $w[0] = $v; $dom.setText($n8, $v); }
        };
        const $s = () => {};
        const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: day.id,
          c: () => {
            const $f = $T0();
            let $c = $dom.firstElementChild($f);
            $n3 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n3);
            $t0.set($n3, () => day);
            {
              let $c1 = $dom.firstElementChild($n3);
              $n6 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n8 = $dom.lastChild($n6);
              $n8 = $dom.textAt($n6, $n8, null);
              $n7 = $c1; $c1 = $dom.nextElementSibling($c1);
              $t0.set($n7, () => day);
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
            $t0.set($n3, () => day);
            {
              let $c1 = $dom.firstElementChild($n3);
              $n6 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n8 = $dom.lastChild($n6);
              $n8 = $dom.textAt($n6, $n8, null);
              $n7 = $c1; $c1 = $dom.nextElementSibling($c1);
              $t0.set($n7, () => day);
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
          u: (...$p) => { [day] = $p; $a(); },
          move: ($ref) => {
            $ref = $mv($ref, $n5);
            $ref = $mv($ref, $n4);
            $ref = $mv($ref, $n3);
            $ref = $mv($ref, $n2);
            return $ref;
          },
          r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); },
        };
      };
      const $u0 = () => {
        const $prev = new Map();
        const $gone = [];
        for (const $i of $k0) { if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }
        const $next = [];
        for (const day of days) {
          const $ky = day.id;
          const $hit = $prev.get($ky);
          if ($hit !== undefined) { $prev.delete($ky); $hit.u(day); $next.push($hit); }
          else { const $i = $b0($n0, $n1, day); $i.c(); $i.m(); $i.s(); $next.push($i); }
        }
        for (const $i of $prev.values()) $gone.push($i);
        for (const $i of $gone) $i.r();
        for (let $j = $next.length - 1, $ref = $n1; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
        $k0 = $next;
      };
      const $s = () => {
        $n0 && $d.push($dom.event($n0, "click", ($event) => { let $z0; for (const $y of $event.composedPath()) { $z0 ??= $t0.get($y); } if ($z0 === undefined) return; return pick($event, $z0()); }));
      };
      const $a = () => {};

      return {
        c: () => {
          $dom.append($shadow, $T1());
          let $c0 = $dom.firstElementChild($shadow);
          $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
          {
            let $c1 = $dom.firstElementChild($n0);
            for (const day of days) {
              const $i = $b0($n0, null, day);
              $i.c();
              $i.s();
              $k0.push($i);
            }
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
            for (const day of days) {
              const $i = $b0($n0, null, day);
              $c1 = $i.h($c1);
              $i.s();
              $k0.push($i);
            }
            $n1 = $dom.lastChild($n0);
            $n9 = $n1;
            for (let $j = $k0.length - 1; $j >= 0; $j -= 1) $n9 = $k0[$j].t($n9);
          }
          $s();
        },
        u: ($p) => { if (2 in $p) days = $p[2] ?? ([]); $a(); $u0(); },
        r: () => { $k0.forEach(($i) => $i.r()); $n0 = $n1 = $n9 = $shadow = $host = null; $d.forEach((d) => d()); $owns.forEach((d) => d()); },
      };
    });
    return $ctl;
  }
});