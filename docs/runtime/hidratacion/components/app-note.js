// components/app-note.js — la única instancia de este tag vive FUERA del viewport
// inicial, tras un hueco > 100vh. Su chunk no se precachea hasta que el scroll la
// hace entrar en viewport (criterios 15 y 16 de SDD-17 §6).

import { browserDom, signal, trace } from '../fudic-dom.js';

const cl = class extends HTMLElement {
  #c;
  h(props) { this.#c = cl.c([browserDom, this.shadowRoot, ...props]); this.#c.h(); }
  c(props) { this.#c = cl.c([browserDom, this.attachShadow({ mode: 'open' }), ...props]); this.#c.c(); }
  disconnectedCallback() { this.#c?.r(); }

  static c($props) {
    let $n0, $n1, $n2;
    const $d = [];
    let [$dom, $shadow, $v1] = $props;           // $v1 = texto de la nota

    const leida = signal(false);
    const marcar = () => leida.set(true);

    const m = () => { $dom.append($shadow, $n0); };
    const s = () => {
      $n2 && $d.push($dom.event($n2, 'click', marcar));
      $d.push(leida.subscribe((v) => {
        $n1.textContent = v ? `${$v1} ✓ leída` : $v1;
        trace(`  handler app-note: leida = ${v}`, 'hnd');
      }));
    };

    return {
      c: () => {
        $n0 = $dom.el('div'); $n0.className = 'box';
        $n1 = $dom.el('span'); $n1.className = 'n'; $n1.textContent = $v1;
        $n2 = $dom.el('button'); $n2.textContent = 'marcar leída';
        $dom.append($n0, $n1, $n2);
        m(); s();
      },
      h: () => { $n0 = $shadow.children[1]; $n1 = $n0.children[0]; $n2 = $n0.children[1]; s(); },
      r: () => { $n0 = null; $n1 = null; $n2 = null; $shadow = null; $d.forEach((d) => d()); },
    };
  }
};

customElements.define('app-note', cl);
