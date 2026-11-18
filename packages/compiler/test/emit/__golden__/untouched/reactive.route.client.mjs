import { subscribe as $sub, written as $written, owned as $owned } from '@fudic/core';
import { signal } from '@fudic/core';

export default ($props) => {
  const [$ctl, $owns] = $owned(() => {
    let $lp0, $n0, $n1, $n2;
    const $d = []; // teardowns
    const $w = []; // last applied, per value write
    let [$dom, $root, $data] = $props;
    const data = $data;
    const n = signal(0);
    let out;
    function more() { n.set(n() + 1); }

    const $s = () => {
      $n0 && $d.push($dom.event($n0, "click", more));
      out = $n1;
      $d.push(() => { out = null; });
      $d.push($sub(n, $u));
      if ($written(n)) $u();
    };
    const $a = () => {
      let $v;
      $v = String((n()) ?? '');
      if ($v !== $w[0] || !(0 in $w)) { $w[0] = $v; $dom.setText($n2, $v); }
    };
    const $u = () => { $a(); };

    return {
      h: () => {
        let $lc0 = $dom.firstElementChild($root);
        $lc0 = $dom.nextElementSibling($lc0);
        $lp0 = $lc0;
        $lc0 = $dom.nextElementSibling($lc0);
        {
          let $lc1 = $dom.firstElementChild($lp0);
          $n0 = $lc1; $lc1 = $dom.nextElementSibling($lc1);
          $n1 = $lc1; $lc1 = $dom.nextElementSibling($lc1);
          $n2 = $dom.lastChild($n1);
          $n2 = $dom.textAt($n1, $n2, null);
        }
        $s();
      },
      u: () => { $u(); },
      r: () => { $lp0 = $n0 = $n1 = $n2 = $root = null; $d.forEach((d) => d()); $owns.forEach((d) => d()); },
    };
  });
  return $ctl;
};