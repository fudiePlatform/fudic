// components/app-parent.js — raíz de la cadena de composición.
//
//   <link rel="component" href="./app-child.fud">
//   @code { @client {
//     import { signal } from '@fudic/dom';
//     const count = signal(0);
//     function inc() { count.set(count.peek() + 1); }
//   } }
//   <div class="node lvl0">
//     <div class="tagline">…</div>
//     <span class="count">@count.value</span>
//     <button @click="@inc">incrementar</button>
//     <app-child />       @* hijo, que compone nieto, que compone bisnieto *@
//   </div>
//
// El paso de estado/props padre->hijo lo resuelve el sistema de props del código
// emitido; el RUNTIME solo garantiza el orden (subárbol vivo antes que el host).

import { browserDom, signal, trace } from '../fudic-dom.js';

const cl = class extends HTMLElement {
  #c;
  h(props) { this.#c = cl.c([browserDom, this.shadowRoot, ...props]); this.#c.h(); }
  c(props) { this.#c = cl.c([browserDom, this.attachShadow({ mode: 'open' }), ...props]); this.#c.c(); }
  disconnectedCallback() { this.#c?.r(); }

  static c($props) {
    let $n0, $n1, $n2, $n3;                     // .node, .tagline, span.count, button
    const $d = [];
    let [$dom, $shadow, $v1, $v2] = $props;     // $v1 = count, $v2 = label

    const count = signal($v1);
    const inc = () => count.set(count.peek() + 1);

    const m = () => { $dom.append($shadow, $n0); };
    const s = () => {
      $n1 && ($n1.dataset.live = '');
      $n3 && $d.push($dom.event($n3, 'click', inc));
      $d.push(count.subscribe((v) => {
        $n2.textContent = String(v);
        trace(`  handler app-parent (${$v2}): count = ${v}`, 'hnd');
      }));
      trace(`  s() app-parent (${$v2}) enganchado`, 'casc');
    };

    return {
      c: () => {
        $n0 = $dom.el('div'); $n0.className = 'node lvl0';
        $n1 = $dom.el('div'); $n1.className = 'tagline'; $n1.textContent = `app-parent · ${$v2}`;
        $n2 = $dom.el('span'); $n2.className = 'count'; $n2.textContent = String(count.peek());
        $n3 = $dom.el('button'); $n3.textContent = 'incrementar';
        $dom.append($n0, $n1, $n2, $n3);
        m(); s();
      },
      h: () => {
        $n0 = $shadow.children[1];
        $n1 = $n0.children[0];
        $n2 = $n0.children[1];
        $n3 = $n0.children[2];
        s();
      },
      r: () => { $n0 = null; $n1 = null; $n2 = null; $n3 = null; $shadow = null; $d.forEach((d) => d()); },
    };
  }
};

customElements.define('app-parent', cl);
