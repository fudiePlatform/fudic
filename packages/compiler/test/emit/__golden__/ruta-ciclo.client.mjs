import { subscribe as $sub, written as $written, owned as $owned, hooks as $hooks } from '@fudic/core';
import { effect, signal } from '@fudic/core';

export default ($props) => {
  const [$ctl, $owns] = $owned(() => {
    let $lp0, $n0, $n1, $n2;
    const $d = []; // teardowns
    const $w = []; // last applied, per value write
    let [$dom, $root, $data] = $props;
    const $hk = $hooks();
    const $hh = $root;
    const data = $data;
    $hk.add("afterHydrate", (host) => {
        host.dataset.layout = 'up';
      });
    $hk.add("onDisconnect", () => {
        sessionStorage.setItem('layout', 'left');
      });
    const count = signal(0);
    $hk.add("beforeHydrate", () => {
    count.set(0);
  });
    $hk.add("afterHydrate", () => {
    count.set(Number(localStorage.getItem('count') ?? '0'));
    effect(() => localStorage.setItem('count', String(count())));
  });
    $hk.add("onConnect", () => {
    document.title = 'ciclo';
  });
    $hk.add("onDisconnect", () => {
    localStorage.setItem('count', String(count()));
  });
    $hk.add("onDispose", () => {
    sessionStorage.removeItem('layout');
  });

    const $s = () => {
      $n0 && $d.push($dom.event($n0, "click", () => count.set(count() + 1)));
      $d.push($sub(count, $u));
      if ($written(count)) $u();
    };
    const $a = () => {
      let $v;
      $v = String((count()) ?? '');
      if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n2, $v); }
    };
    const $u = () => { $a(); };

    return {
      h: () => {
        $hk.run("beforeHydrate", $hh);
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
        $hk.run("afterHydrate", $hh);
      },
      u: () => { $u(); },
      r: () => { $hk.dispose($hh); $lp0 = $n0 = $n1 = $n2 = $root = null; $d.forEach((d) => d()); $owns.forEach((d) => d()); },
      on: () => $hk.on($hh),
      off: () => $hk.off($hh),
    };
  });
  return $ctl;
};