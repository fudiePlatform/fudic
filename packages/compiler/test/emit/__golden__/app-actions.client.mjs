import { FudicElement } from '@fudic/core';
import { emit } from '@fudic/dom';

customElements.define("app-actions", class extends FudicElement {
  static c($props) {
    let $n0, $n1;
    const $r = [];
    const $d = []; // teardowns
    let [$dom, $shadow, rows = []] = $props;
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
      let $n2, $n3, $n4, $n5, $n6, $n7, $n8, $n9, $n10, $n11, $n12;
      const $r = [];
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      const $a = () => {
        let $v;
        $v = String((row.label) ?? '');
        if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n12, $v); }
      };
      const $s = () => {
        $n6 && $d.push($dom.event($n6, "click", ($event) => del()));
        $n7 && $d.push($dom.event($n7, "click", ($event) => delEvent($event)));
        $n8 && $d.push($dom.event($n8, "click", ($event) => delRow(row.id)));
        $n9 && $d.push($dom.event($n9, "click", ($event) => delRowEvent($event, row.id)));
        $n10 && $d.push($dom.event($n10, "click", ($event) => delRowReversed(row.id, $event)));
        $n11 && $d.push($dom.event($n11, "click", del));
      };
      const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
      return {
        key: row.id,
        c: () => {
          $n2 = $dom.text(" ");
          $r.push($n2);
          $n3 = $dom.element("li");
          $dom.setAttr($n3, 'class', ["row"].filter(Boolean).join(' '));
          $dom.append($n3, $dom.text(" "));
          $n5 = $dom.element("span");
          $n12 = $dom.text('');
          $dom.append($n5, $n12);
          $dom.append($n3, $n5);
          $dom.append($n3, $dom.text(" "));
          $n6 = $dom.element("button");
          $dom.setAttr($n6, 'class', ["none"].filter(Boolean).join(' '));
          $dom.append($n6, $dom.text("-"));
          $dom.append($n3, $n6);
          $dom.append($n3, $dom.text(" "));
          $n7 = $dom.element("button");
          $dom.setAttr($n7, 'class', ["event"].filter(Boolean).join(' '));
          $dom.append($n7, $dom.text("e"));
          $dom.append($n3, $n7);
          $dom.append($n3, $dom.text(" "));
          $n8 = $dom.element("button");
          $dom.setAttr($n8, 'class', ["data"].filter(Boolean).join(' '));
          $dom.append($n8, $dom.text("d"));
          $dom.append($n3, $n8);
          $dom.append($n3, $dom.text(" "));
          $n9 = $dom.element("button");
          $dom.setAttr($n9, 'class', ["both"].filter(Boolean).join(' '));
          $dom.append($n9, $dom.text("ed"));
          $dom.append($n3, $n9);
          $dom.append($n3, $dom.text(" "));
          $n10 = $dom.element("button");
          $dom.setAttr($n10, 'class', ["reversed"].filter(Boolean).join(' '));
          $dom.append($n10, $dom.text("de"));
          $dom.append($n3, $n10);
          $dom.append($n3, $dom.text(" "));
          $n11 = $dom.element("button");
          $dom.setAttr($n11, 'class', ["bare"].filter(Boolean).join(' '));
          $dom.append($n11, $dom.text("x"));
          $dom.append($n3, $n11);
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
          {
            let $c1 = $dom.firstElementChild($n3);
            $n5 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n12 = $dom.lastChild($n5);
            $n6 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n7 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n8 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n9 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n10 = $c1; $c1 = $dom.nextElementSibling($c1);
            $n11 = $c1; $c1 = $dom.nextElementSibling($c1);
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
        u: (...$p) => { [row] = $p; $a(); },
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
    const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const $s = () => {
      $d.push($dom.bus($host, "cleared", ($event) => onCleared.call($host, $event)));
    };
    const $a = () => {};

    return {
      c: () => {
        $r.push($dom.text(" "));
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
        $n1 = $dom.text(" ");
        $dom.append($n0, $n1);
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
          for (const row of rows) {
            const $i = $b0($n0, null, row);
            $c1 = $i.h($c1);
            $i.s();
            $k0.push($i);
          }
          $n1 = $dom.lastChild($n0);
        }
        $s();
      },
      u: ($p) => { [, , rows = []] = $p; $a(); $u0(); },
      r: () => { $k0.forEach(($i) => $i.r()); $n0 = $n1 = $shadow = $host = null; $d.forEach((d) => d()); },
    };
  }
});