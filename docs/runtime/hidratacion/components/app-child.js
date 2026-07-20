// components/app-child.js — nivel 1 de la cadena de composición.
// Compone <app-grandchild />. Su `s()` corre ANTES que el del padre: es lo que la
// cascada en post-orden garantiza.

import { browserDom, trace } from '../fudic-dom.js';

const cl = class extends HTMLElement {
  #c;
  h(props) { this.#c = cl.c([browserDom, this.shadowRoot, ...props]); this.#c.h(); }
  c(props) { this.#c = cl.c([browserDom, this.attachShadow({ mode: 'open' }), ...props]); this.#c.c(); }
  disconnectedCallback() { this.#c?.r(); }

  static c($props) {
    let $n0, $n1;
    const $d = [];
    let [$dom, $shadow, $v1] = $props;          // $v1 = label

    const m = () => { $dom.append($shadow, $n0); };
    const s = () => {
      $n1 && ($n1.dataset.live = '');
      trace(`  s() app-child (${$v1}) enganchado`, 'casc');
    };

    return {
      c: () => {
        $n0 = $dom.el('div'); $n0.className = 'node lvl1';
        $n1 = $dom.el('div'); $n1.className = 'tagline'; $n1.textContent = `app-child · ${$v1}`;
        $dom.append($n0, $n1);
        m(); s();
      },
      h: () => { $n0 = $shadow.children[1]; $n1 = $n0.children[0]; s(); },
      r: () => { $n0 = null; $n1 = null; $shadow = null; $d.forEach((d) => d()); },
    };
  }
};

customElements.define('app-child', cl);
