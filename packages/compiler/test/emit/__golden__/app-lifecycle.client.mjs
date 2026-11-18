import { FudicElement, painted as $painted, live as $live, owned as $owned, hooks as $hooks } from '@fudic/core';
import { template as $template } from '@fudic/dom';
const $T0 = $template`<app-lifecycle-row></app-lifecycle-row>`;
const $T1 = $template`<div class="box"></div>`;

customElements.define("app-lifecycle", class extends FudicElement {
  static c($props) {
    const [$ctl, $owns] = $owned(() => {
      let $n0, $n2;
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      let [$dom, $shadow, variant, rows] = $props; variant ??= ('default'); rows ??= ([]);
      const $hk = $hooks();
      const $hh = $dom.host($shadow);
      let $host = $dom.host($shadow);
      let box: HTMLElement | null = null;
      const log: string[] = [];
      $hk.add("beforeHydrate", () => {
    log.push('beforeHydrate');
  });
      $hk.add("afterHydrate", (host) => {
    log.push('afterHydrate');
    host.dataset.box = String(box !== null);
  });
      $hk.add("beforeCreate", () => {
    log.push('beforeCreate');
  });
      $hk.add("afterCreate", () => {
    log.push('afterCreate');
    return () => log.push('afterCreate cleanup');
  });
      $hk.add("onConnect", (host) => {
    const ro = new ResizeObserver(() => {});
    ro.observe(host);
    return () => ro.disconnect();
  });
      $hk.add("onDisconnect", () => {
    log.push('onDisconnect');
  });
      $hk.add("onDispose", () => {
    log.push('onDispose');
  });

      let $k0 = [];
      const $b0 = ($parent, $anchor, row) => {
        let $n1;
        const $r = [];
        const $d = []; // teardowns
        const $a = () => {};
        const $s = () => {};
        const $mv = ($ref, $n) => { const $at = $ref === null ? $dom.lastChild($parent) === $n : $dom.nextSibling($n) === $ref; if (!$r.includes($n)) return $at ? $n : $ref; if ($at) return $n; if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };
        return {
          key: row.id,
          c: () => {
            const $f = $T0();
            let $c = $dom.firstElementChild($f);
            $n1 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n1);
            $live($n1, [(row.label)], $shadow);
            $a();
          },
          h: ($c) => {
            $n1 = $c; $c = $dom.nextElementSibling($c);
            $r.push($n1);
            return $c;
          },
          t: ($e) => {
            $e = $n1;
            return $e;
          },
          m: ($ref = $anchor) => {
            $anchor = $ref;
            for (const $n of [$n1]) $mv($anchor, $n);
          },
          s: $s,
          u: (...$p) => { const $moved = [row].some(($x, $i) => $x !== $p[$i]); [row] = $p; $a(); if ($moved) $n1.u([, , (row.label)]); },
          move: ($ref) => {
            $ref = $mv($ref, $n1);
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
          else { const $i = $b0($n0, null, row); $i.c(); $i.m(); $i.s(); $next.push($i); }
        }
        for (const $i of $prev.values()) $gone.push($i);
        for (const $i of $gone) $i.r();
        for (let $j = $next.length - 1, $ref = null; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
        $k0 = $next;
      };
      const $s = () => {
        box = $n0;
        $d.push(() => { box = null; });
      };
      const $a = () => {
        let $v;
        $v = (variant);
        if ($v !== $w[0] || !(0 in $w)) { $w[0] = $v; if ($v === true) $dom.setAttr($host, "variant", ''); else if ($v !== false && $v != null) $dom.setAttr($host, "variant", String($v)); else $dom.removeAttr($host, "variant"); }
      };

      return {
        c: () => {
          $hk.run("beforeCreate", $hh);
          $dom.append($shadow, $T1());
          $dom.setAttr($host, "role", "group");
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
            for (const $i of $k0) $i.m(null);
          }
          $a();
          $s();
          $hk.run("afterCreate", $hh);
        },
        h: () => {
          $hk.run("beforeHydrate", $hh);
          $painted(() => {
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
              $n2 = null;
              for (let $j = $k0.length - 1; $j >= 0; $j -= 1) $n2 = $k0[$j].t($n2);
            }
          });
          $s();
          $hk.run("afterHydrate", $hh);
        },
        u: ($p) => { if (2 in $p) variant = $p[2] ?? ('default'); if (3 in $p) rows = $p[3] ?? ([]); $a(); $u0(); },
        r: () => { $hk.dispose($hh); $k0.forEach(($i) => $i.r()); $n0 = $n2 = $shadow = $host = null; $d.forEach((d) => d()); $owns.forEach((d) => d()); },
        on: () => $hk.on($hh),
        off: () => $hk.off($hh),
      };
    });
    return $ctl;
  }
});