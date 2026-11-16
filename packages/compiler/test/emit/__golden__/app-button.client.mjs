import { FudicElement, owned as $owned } from '@fudic/core';
import { emit } from '@fudic/dom';

customElements.define("app-button", class extends FudicElement {
  static c($props) {
    const [$ctl, $owns] = $owned(() => {
      let $n0, $n1;
      const $r = [];
      const $d = []; // teardowns
      const $w = []; // last applied, per value write
      let [$dom, $shadow, variant, disabled] = $props; variant ??= ('primary'); disabled ??= (false);
      let $host = $dom.host($shadow);
      function onClick() {
    emit.call($host, 'press');
  }

      const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };
      const $s = () => {
        $n0 && $d.push($dom.event($n0, "click", onClick));
      };
      const $a = () => {
        let $v;
        $v = (disabled);
        if ($v !== $w[0]) { $w[0] = $v; if ($v === true) $dom.setAttr($n0, "disabled", ''); else if ($v !== false && $v != null) $dom.setAttr($n0, "disabled", String($v)); else $dom.removeAttr($n0, "disabled"); }
        $v = !!((variant === 'primary'));
        if ($v !== $w[1]) { $w[1] = $v; $dom.toggleClass($n0, "primary", $v); }
        $v = !!((variant === 'ghost'));
        if ($v !== $w[2]) { $w[2] = $v; $dom.toggleClass($n0, "ghost", $v); }
      };

      return {
        c: () => {
          $n0 = $dom.element("button");
          $dom.setAttr($n0, 'class', "btn");
          $n1 = $dom.element("slot");
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
            $n1 = $c1; $c1 = $dom.nextElementSibling($c1);
          }
          $s();
        },
        u: ($p) => { if (2 in $p) variant = $p[2] ?? ('primary'); if (3 in $p) disabled = $p[3] ?? (false); $a(); },
        r: () => { $n0 = $n1 = $shadow = $host = null; $d.forEach((d) => d()); $owns.forEach((d) => d()); },
      };
    });
    return $ctl;
  }
});