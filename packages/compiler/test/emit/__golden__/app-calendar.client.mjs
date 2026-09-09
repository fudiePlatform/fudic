import { FudicElement } from '@fudic/core';
import { emit } from '@fudic/dom';

customElements.define("app-calendar", class extends FudicElement {
  static c($props) {
    let $n0, $n1;
    const $r = [];
    const $d = []; // teardowns
    let [$dom, $shadow, days = []] = $props;
    let $host = $dom.host($shadow);
    function pick(ev, day) {
      ev.preventDefault();
      emit.call($host, 'picked', day.id);
    }

    const $t0 = new WeakMap();
    let $k0 = [];
    const $b0 = ($parent, $anchor, day) => {
      let $n2, $n3, $n4, $n5, $n6, $n7;
      const $r = [];
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      const $a = () => {
        let $v;
        $v = String((day.n) ?? '');
        if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n7, $v); }
      };
      const $s = () => {};
      const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: day.id,
        c: () => {
          $n2 = $dom.text(" ");
          $r.push($n2);
          $n3 = $dom.element("div");
          $dom.setAttr($n3, 'class', ["cell"].filter(Boolean).join(' '));
          $t0.set($n3, () => day);
          $dom.append($n3, $dom.text(" "));
          $n5 = $dom.element("span");
          $n7 = $dom.text('');
          $dom.append($n5, $n7);
          $dom.append($n3, $n5);
          $dom.append($n3, $dom.text(" "));
          $n6 = $dom.element("button");
          $t0.set($n6, () => day);
          $dom.append($n6, $dom.text("e"));
          $dom.append($n3, $n6);
          $dom.append($n3, $dom.text(" "));
          $r.push($n3);
          $n4 = $dom.text(" ");
          $r.push($n4);
          $a();
        },
        h: ($c) => {
          $n2 = $dom.previousSibling($c);
          $r.push($n2);
          $n3 = $c; $c = $dom.nextElementSibling($c);
          $r.push($n3);
          $t0.set($n3, () => day);
          {
            let $c1 = $dom.firstElementChild($n3);
            $n5 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n7 = $dom.lastChild($n5);
            $n6 = $c1; $c1 = $dom.nextElementSibling($c1);
            $t0.set($n6, () => day);
          }
          $n4 = $dom.lastChild($parent);
          $r.push($n4);
          return $c;
        },
        m: ($ref = $anchor) => {
          $anchor = $ref;
          for (const $n of $r) $mv($anchor, $n);
        },
        s: $s,
        u: (...$p) => { [day] = $p; $a(); },
        move: ($ref) => {
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
    const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const $s = () => {
      $n0 && $d.push($dom.event($n0, "click", ($event) => { let $z0; for (const $y of $event.composedPath()) { $z0 ??= $t0.get($y); } if ($z0 === undefined) return; return pick($event, $z0()); }));
    };
    const $a = () => {};

    return {
      c: () => {
        $n0 = $dom.element("div");
        $dom.setAttr($n0, 'class', ["grid"].filter(Boolean).join(' '));
        $dom.append($n0, $dom.text(" "));
        for (const day of days) {
          const $i = $b0($n0, null, day);
          $i.c();
          $i.m();
          $i.s();
          $k0.push($i);
        }
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
          for (const day of days) {
            const $i = $b0($n0, null, day);
            $c1 = $i.h($c1);
            $i.s();
            $k0.push($i);
          }
          $n1 = $dom.lastChild($n0);
        }
        $s();
      },
      u: ($p) => { if (2 in $p) days = $p[2] === undefined ? [] : $p[2]; $a(); $u0(); },
      r: () => { $k0.forEach(($i) => $i.r()); $n0 = $n1 = $shadow = $host = null; $d.forEach((d) => d()); },
    };
  }
});