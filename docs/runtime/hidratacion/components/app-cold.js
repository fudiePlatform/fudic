// components/app-cold.js — tag EXCLUIDO del warm (NO_WARM en runtime.js).
// Su chunk nunca se precachea, así que su primera interacción paga red DENTRO del
// gesto: es la evidencia del cache-miss (criterio 22 de SDD-17 §6).

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

    const n = signal($v1);
    const inc = () => n.set(n.peek() + 1);

    const m = () => { $dom.append($shadow, $n0); };
    const s = () => {
      $n2 && $d.push($dom.event($n2, 'click', inc));
      $d.push(n.subscribe((v) => {
        $n1.textContent = String(v);
        trace(`  handler app-cold: n = ${v}`, 'hnd');
      }));
    };

    return {
      c: () => {
        $n0 = $dom.el('div'); $n0.className = 'box';
        $n1 = $dom.el('span'); $n1.className = 'n'; $n1.textContent = String(n.peek());
        $n2 = $dom.el('button'); $n2.textContent = '+1';
        $dom.append($n0, $n1, $n2);
        m(); s();
      },
      h: () => { $n0 = $shadow.children[1]; $n1 = $n0.children[0]; $n2 = $n0.children[1]; s(); },
      r: () => { $n0 = null; $n1 = null; $n2 = null; $shadow = null; $d.forEach((d) => d()); },
    };
  }
};

customElements.define('app-cold', cl);
