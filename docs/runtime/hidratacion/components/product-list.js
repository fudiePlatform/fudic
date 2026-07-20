// components/product-list.js — EMISOR del bus.
//
//   @code {
//     type Producto = { id: string; nombre: string; precio: number };
//     @client {
//       import { emit } from '@fudic/dom';
//       function añadir(p: Producto) { emit('carrito', p); }
//     }
//   }
//   <ul class="lista">
//     @foreach (const p of productos) {
//       <li><span>@p.nombre</span><span>@p.precio €</span>
//         <button @click="@(() => añadir(p))">Añadir</button></li>
//     }
//   </ul>
//
// El developer escribe `emit('carrito', p)`; el compilador lo reescribe a
// `emit.call($host, 'carrito', p)` — el host NO aparece en la firma del usuario.
// `emit` fuerza bubbles + composed.

import { browserDom, emit, trace } from '../fudic-dom.js';

const cl = class extends HTMLElement {
  #c;
  h(props) { this.#c = cl.c([browserDom, this.shadowRoot, ...props]); this.#c.h(); }
  c(props) { this.#c = cl.c([browserDom, this.attachShadow({ mode: 'open' }), ...props]); this.#c.c(); }
  disconnectedCallback() { this.#c?.r(); }

  static c($props) {
    let $n0;                                    // ul.lista
    let $btns = [];                             // botones del @foreach, por posición
    const $d = [];
    let [$dom, $shadow, $v1] = $props;          // $v1 = productos
    const $host = $shadow.host;                 // contexto inyectado por el compilador

    const productos = $v1;
    const añadir = (p) => {
      trace(`emisor product-list: emit('carrito', ${p.nombre})`, 'bus');
      emit.call($host, 'carrito', p);
    };

    const m = () => { $dom.append($shadow, $n0); };
    const s = () => {
      // Un listener por fila, no delegación: es lo que emite el @foreach.
      $btns.forEach((b, i) => b && $d.push($dom.event(b, 'click', () => añadir(productos[i]))));
    };

    return {
      c: () => {
        $n0 = $dom.el('ul'); $n0.className = 'lista';
        $btns = productos.map((p) => {
          const li = $dom.el('li');
          const n = $dom.el('span'); n.textContent = p.nombre;
          const pr = $dom.el('span'); pr.textContent = `${p.precio.toFixed(2)} €`;
          const b = $dom.el('button'); b.textContent = 'Añadir'; b.dataset.pid = p.id;
          $dom.append(li, n, pr, b);
          $dom.append($n0, li);
          return b;
        });
        m(); s();
      },
      // Traversal posicional sobre las filas ya renderizadas por SSR.
      h: () => {
        $n0 = $shadow.children[1];
        $btns = [];
        for (let li = $n0.firstElementChild; li; li = li.nextElementSibling) {
          $btns.push(li.children[2]);
        }
        s();
      },
      r: () => { $n0 = null; $btns = []; $shadow = null; $d.forEach((d) => d()); },
    };
  }
};

customElements.define('product-list', cl);
