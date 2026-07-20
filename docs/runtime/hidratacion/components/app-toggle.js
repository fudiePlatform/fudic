// components/app-toggle.js — CHUNK EMITIDO desde app-toggle.fud.
//
//   @code { @client {
//     import { signal } from '@fudic/dom';
//     const on = signal(true);
//     function toggle() { on.set(!on.peek()); }
//   } }
//   <div class="box"><span class="pill">@(on.value ? 'ON' : 'OFF')</span>
//     <button @click="@toggle">toggle</button></div>

import { browserDom, signal, trace } from '../fudic-dom.js';

const cl = class extends HTMLElement {
  #c;
  h(props) { this.#c = cl.c([browserDom, this.shadowRoot, ...props]); this.#c.h(); }
  c(props) { this.#c = cl.c([browserDom, this.attachShadow({ mode: 'open' }), ...props]); this.#c.c(); }
  disconnectedCallback() { this.#c?.r(); }

  static c($props) {
    let $n0, $n1, $n2;
    const $d = [];
    let [$dom, $shadow, $v1] = $props;

    const on = signal($v1);
    const toggle = () => on.set(!on.peek());

    const m = () => { $dom.append($shadow, $n0); };
    const s = () => {
      $n2 && $d.push($dom.event($n2, 'click', toggle));
      $d.push(on.subscribe((v) => {
        $n1.textContent = v ? 'ON' : 'OFF';
        $n1.className = `pill ${v ? 'on' : 'off'}`;
        trace(`  handler app-toggle: on = ${v}`, 'hnd');
      }));
    };

    return {
      c: () => {
        $n0 = $dom.el('div'); $n0.className = 'box';
        $n1 = $dom.el('span'); $n1.className = `pill ${on.peek() ? 'on' : 'off'}`;
        $n1.textContent = on.peek() ? 'ON' : 'OFF';
        $n2 = $dom.el('button'); $n2.textContent = 'toggle';
        $dom.append($n0, $n1, $n2);
        m(); s();
      },
      h: () => {
        $n0 = $shadow.children[1];
        $n1 = $n0.children[0];
        $n2 = $n0.children[1];
        s();
      },
      r: () => { $n0 = null; $n1 = null; $n2 = null; $shadow = null; $d.forEach((d) => d()); },
    };
  }
};

customElements.define('app-toggle', cl);
