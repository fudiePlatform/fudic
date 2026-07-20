// components/app-counter.js — CHUNK EMITIDO por el compilador desde app-counter.fud.
//
// .fud original (lo que el developer ESCRIBE):
//
//   @code {
//     @client {
//       import { signal } from '@fudic/dom';
//       const count = signal(0);
//       function inc() { count.set(count.peek() + 1); }
//     }
//   }
//   <div class="box">contador <span class="n">@count.value</span>
//     <button @click="@inc">+1</button></div>
//
// Forma del artefacto: SDD-15 §3.7 y §4.6. La interfaz pública del controlador es
// exactamente {c, h, r}; `m` (mount) y `s` (subscription) son closures PRIVADAS del
// factory, porque solo tienen llamadores internos.
//
// NOTA DE PROTOTIPO: aquí `$dom` es el adapter real (fudic-dom.js), pero la creación
// de nodos usa `document.createElement` a través de `$dom.el(...)`, que es
// literalmente lo que el emit genera. Lo único simplificado son los nodos de texto.

import { browserDom, signal, trace } from '../fudic-dom.js';

const cl = class extends HTMLElement {
  #c;

  // Punto de entrada 1 (SDD-15 §4.3): instancia venida de SSR. El shadow ya está
  // renderizado (DSD); el controlador ADOPTA los nodos. Los props son el tramo del
  // payload, que le PASA el runtime — la instancia no conoce su `data-id`.
  h(props) {
    this.#c = cl.c([browserDom, this.shadowRoot, ...props]);
    this.#c.h();
  }

  // Punto de entrada 2: instancia creada en runtime por el controlador padre. No hay
  // shadow que adoptar: el factory FABRICA los nodos.
  c(props) {
    this.#c = cl.c([browserDom, this.attachShadow({ mode: 'open' }), ...props]);
    this.#c.c();
  }

  disconnectedCallback() { this.#c?.r(); }

  static c($props) {
    let $n0, $n1, $n2;                       // .box, span.n, button
    const $d = [];                           // disposers
    // Destructuring: el simétrico exacto del Object.values de la rama servidor.
    let [$dom, $shadow, $v1] = $props;

    // --- @client del developer, copiado textualmente a la closure ---
    const count = signal($v1);
    const inc = () => count.set(count.peek() + 1);

    // Privada: ensambla en el shadow los nodos ya fabricados. Solo la llama `c`.
    const m = () => { $dom.append($shadow, $n0); };

    // Privada: engancha listeners y suscripciones una vez que hay referencias.
    // PUNTO COMÚN de create e hydrate; vive una sola vez.
    const s = () => {
      $n2 && $d.push($dom.event($n2, 'click', inc));
      // @count.value -> suscripción fine-grained, no re-render.
      $d.push(count.subscribe((v) => {
        $n1.textContent = String(v);
        trace(`  handler app-counter: count = ${v}`, 'hnd');
      }));
    };

    return {
      // create: fabrica -> monta -> engancha
      c: () => {
        $n0 = $dom.el('div'); $n0.className = 'box';
        $n0.appendChild(new Text('contador '));
        $n1 = $dom.el('span'); $n1.className = 'n'; $n1.textContent = String(count.peek());
        $n2 = $dom.el('button'); $n2.textContent = '+1';
        $dom.append($n0, $n1, $n2);
        m();
        s();
      },
      // hydrate: adopta por TRAVERSAL POSICIONAL (nunca querySelector, nunca
      // cloneNode) -> engancha. children[0] es el <style> inline del shadow.
      h: () => {
        $n0 = $shadow.children[1];
        $n1 = $n0.children[0];
        $n2 = $n0.children[1];
        s();
      },
      // remove: teardown simétrico.
      r: () => {
        $n0 = null; $n1 = null; $n2 = null; $shadow = null;
        $d.forEach((d) => d());
      },
    };
  }
};

customElements.define('app-counter', cl);
