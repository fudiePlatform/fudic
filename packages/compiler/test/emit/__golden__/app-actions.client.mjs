import { FudicElement, owned as $owned } from '@fudic/core';
import { emit } from '@fudic/dom';
import { template as $template } from '@fudic/dom';
const $T0 = $template` <li class="row"> <span></span> <button class="none">-</button> <button class="event">e</button> <button class="data">d</button> <button class="both">ed</button> <button class="reversed">de</button> <button class="bare">x</button> </li> <!---->`;
const $T1 = $template`<ul class="list"> <!----> </ul>`;

customElements.define("app-actions", class extends FudicElement {
  static c($props) {
    const [$ctl, $owns] = $owned(() => {
      let $n0, $n1, $n14;
      const $d = []; // teardowns
      let [$dom, $shadow, rows] = $props; rows ??= ([]);
      let $host = $dom.host($shadow);
      function del() {
    emit.call($host, 'cleared');
  }
      function delEvent(ev) {
    ev.preventDefault();
  }
      function delRow(id) {
    emit.call($host, 'removed', id);
  }
      function delRowEvent(ev, id) {
    ev.preventDefault();
    emit.call($host, 'removed', id);
  }
      function delRowReversed(id, ev) {
    delRowEvent(ev, id);
  }
      function onCleared(ev) {
    this.dataset.last = ev.type;
  }

      let $k0 = [];
      const $b0 = ($parent, $anchor, row) => {
        let $n2, $n3, $n4, $n5, $n6, $n7, $n8, $n9, $n10, $n11, $n12, $n13;
        const $r = [];
        const $d = []; // teardowns
        const $w = []; // last applied, per value write
        const $a = () => {
          let $v;
          $v = String((row.label) ?? '');
          if ($v !== $w[0] || !(0 in $w)) { $w[0] = $v; $dom.setText($n13, $v); }
        };
        const $s = () => {
          $n7 && $d.push($dom.event($n7, "click", ($event) => del()));
          $n8 && $d.push($dom.event($n8, "click", ($event) => delEvent($event)));
          $n9 && $d.push($dom.event($n9, "click", ($event) => delRow(row.id)));
          $n10 && $d.push($dom.event($n10, "click", ($event) => delRowEvent($event, row.id)));
          $n11 && $d.push($dom.event($n11, "click", ($event) => delRowReversed(row.id, $event)));
          $n12 && $d.push($dom.event($n12, "click", del));
        };
        const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: row.id,
          c: () => {
            const $f = $T0();
            let $c = $dom.firstElementChild($f);
            $n3 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n3);
            {
              let $c1 = $dom.firstElementChild($n3);
              $n6 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n13 = $dom.lastChild($n6);
              $n13 = $dom.textAt($n6, $n13, null);
              $n7 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n8 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n9 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n10 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n11 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n12 = $c1; $c1 = $dom.nextElementSibling($c1);
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
              $n13 = $dom.lastChild($n6);
              $n13 = $dom.textAt($n6, $n13, null);
              $n7 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n8 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n9 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n10 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n11 = $c1; $c1 = $dom.nextElementSibling($c1);
              $n12 = $c1; $c1 = $dom.nextElementSibling($c1);
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
          u: (...$p) => { [row] = $p; $a(); },
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
        for (const row of rows) {
          const $ky = row.id;
          const $hit = $prev.get($ky);
          if ($hit !== undefined) { $prev.delete($ky); $hit.u(row); $next.push($hit); }
          else { const $i = $b0($n0, $n1, row); $i.c(); $i.m(); $i.s(); $next.push($i); }
        }
        for (const $i of $prev.values()) $gone.push($i);
        for (const $i of $gone) $i.r();
        for (let $j = $next.length - 1, $ref = $n1; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
        $k0 = $next;
      };
      const $s = () => {
        $d.push($dom.bus($host, "cleared", ($event) => onCleared.call($host, $event)));
      };
      const $a = () => {};

      return {
        c: () => {
          $dom.append($shadow, $T1());
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
            $n1 = $dom.lastChild($n0);
            $n14 = $n1;
            for (let $j = $k0.length - 1; $j >= 0; $j -= 1) $n14 = $k0[$j].t($n14);
          }
          $s();
        },
        u: ($p) => { if (2 in $p) rows = $p[2] ?? ([]); $a(); $u0(); },
        r: () => { $k0.forEach(($i) => $i.r()); $n0 = $n1 = $n14 = $shadow = $host = null; $d.forEach((d) => d()); $owns.forEach((d) => d()); },
      };
    });
    return $ctl;
  }
});