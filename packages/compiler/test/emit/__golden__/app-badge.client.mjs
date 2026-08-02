import { FudicElement } from '@fudic/core';

customElements.define("app-badge", class extends FudicElement {
  static c($props) {
    let $n0, $n1;
    const $r = [];
    const $d = []; // teardowns
    let [$dom, $shadow, tone = 'neutral'] = $props;

    const m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const s = () => {};

    return {
      c: () => {
        $r.push($dom.text(" "));
        $n0 = $dom.element("span");
        $dom.setAttr($n0, 'class', ["badge", (tone === 'success') && "success", (tone === 'warning') && "warning"].filter(Boolean).join(' '));
        $dom.append($n0, $dom.text(" "));
        $n1 = $dom.element("slot");
        $dom.append($n0, $n1);
        $dom.append($n0, $dom.text(" "));
        $r.push($n0);
        $r.push($dom.text(" "));
        m();
        s();
      },
      h: () => {
        let $c0 = $dom.firstElementChild($shadow);
        $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
        {
          let $c1 = $dom.firstElementChild($n0);
          $n1 = $c1; $c1 = $dom.nextElementSibling($c1);
        }
        s();
      },
      r: () => { $n0 = $n1 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});