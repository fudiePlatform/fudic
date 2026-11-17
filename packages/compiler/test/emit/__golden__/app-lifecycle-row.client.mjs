import { FudicElement, owned as $owned, hooks as $hooks } from '@fudic/core';
import { template as $template } from '@fudic/dom';
const $T0 = $template` <span></span> `;

customElements.define("app-lifecycle-row", class extends FudicElement {
  static c($props) {
    const [$ctl, $owns] = $owned(() => {
      let $n0, $n1;
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      let [$dom, $shadow, label] = $props; label ??= ('');
      const $hk = $hooks();
      const $hh = $dom.host($shadow);
      $hk.add("afterHydrate", (host) => {
    host.dataset.ready = 'hydrated';
  });
      $hk.add("afterCreate", (host) => {
    host.dataset.ready = 'created';
  });
      $hk.add("onConnect", (host) => {
    host.dataset.connected = 'yes';
    return () => {
      host.dataset.connected = 'no';
    };
  });

      const $s = () => {};
      const $a = () => {
        let $v;
        $v = String((label) ?? '');
        if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n1, $v); }
      };

      return {
        c: () => {
          $dom.append($shadow, $T0());
          let $c0 = $dom.firstElementChild($shadow);
          $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
          $n1 = $dom.lastChild($n0);
          $n1 = $dom.textAt($n0, $n1, null);
          $a();
          $s();
          $hk.run("afterCreate", $hh);
        },
        h: () => {
          let $c0 = $dom.firstElementChild($shadow);
          $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
          $n1 = $dom.lastChild($n0);
          $n1 = $dom.textAt($n0, $n1, null);
          $s();
          $hk.run("afterHydrate", $hh);
        },
        u: ($p) => { if (2 in $p) label = $p[2] ?? (''); $a(); },
        r: () => { $hk.dispose($hh); $n0 = $n1 = $shadow = null; $d.forEach((d) => d()); $owns.forEach((d) => d()); },
        on: () => $hk.on($hh),
        off: () => $hk.off($hh),
      };
    });
    return $ctl;
  }
});