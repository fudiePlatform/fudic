// components/shopping-cart.js — SUSCRIPTOR del bus.
//
//   @code { @client {
//     import { signal } from '@fudic/dom';
//     const items = signal(0);
//     const total = signal(0);
//     function onCarrito(ev) {
//       items.set(items.peek() + 1);
//       total.set(total.peek() + ev.detail.precio);
//     }
//   } }
//   <div class="carrito" bus:carrito="@onCarrito(ev)">
//     <span class="badge">@items.value</span>
//     <span class="importe">@total.value €</span>
//   </div>
//
// `bus:` ESCUCHA EN `document`, NUNCA EN EL HOST (SDD-15 §4.4). Emisor y suscriptor
// son HERMANOS: un CustomEvent que burbujea desde <product-list> sube por SUS
// ancestros (product-list -> #app -> body -> document) y NUNCA entra en
// <shopping-cart>, que no es ancestro del emisor. Un listener sobre el host no
// dispararía jamás.
//
// El enganche vive en `s()` y la baja en `r()`. Un `bus:` sin baja en `r()` es una
// FUGA: el listener vive en `document` y sobrevive al host.

import { browserDom, signal, trace } from '../fudic-dom.js';

const cl = class extends HTMLElement {
  #c;
  h(props) { this.#c = cl.c([browserDom, this.shadowRoot, ...props]); this.#c.h(); }
  c(props) { this.#c = cl.c([browserDom, this.attachShadow({ mode: 'open' }), ...props]); this.#c.c(); }
  disconnectedCallback() { this.#c?.r(); }

  static c($props) {
    let $n0, $n1, $n2;                          // .carrito, .badge, .importe
    const $d = [];
    let [$dom, $shadow, $v1, $v2] = $props;     // $v1 = items, $v2 = total
    const $host = $shadow.host;

    const items = signal($v1);
    const total = signal($v2);
    function onCarrito(ev) {
      items.set(items.peek() + 1);
      total.set(total.peek() + ev.detail.precio);
      trace(`carrito recibido: ${ev.detail.nombre} (+${ev.detail.precio.toFixed(2)} €) -> items=${items.peek()} total=${total.peek().toFixed(2)} €`, 'cart');
    }

    const m = () => { $dom.append($shadow, $n0); };
    const s = () => {
      // bus:carrito -> listener sobre document, contexto = el host.
      $d.push($dom.bus($host, 'carrito', (ev) => onCarrito.call($host, ev)));

      // EVIDENCIA del criterio 13, no parte del componente real: el mismo nombre
      // como @evento de HOST. Nunca se dispara — el bus no pasa por aquí.
      $d.push($dom.event($host, 'carrito', () => trace('!! un @carrito de host SÍ recibió (no debería)', 'net')));

      $d.push(items.subscribe((v) => { $n1.textContent = String(v); }));
      $d.push(total.subscribe((v) => { $n2.textContent = `${v.toFixed(2)} €`; }));
      trace('  s() shopping-cart enganchado (listener de bus en document)', 'bus');
    };

    return {
      c: () => {
        $n0 = $dom.el('div'); $n0.className = 'carrito';
        $n1 = $dom.el('span'); $n1.className = 'badge'; $n1.textContent = String(items.peek());
        $n2 = $dom.el('span'); $n2.className = 'importe'; $n2.textContent = `${total.peek().toFixed(2)} €`;
        $dom.append($n0, $n1, $n2);
        m(); s();
      },
      h: () => {
        $n0 = $shadow.children[1];
        $n1 = $n0.children[0];
        $n2 = $n0.children[1];
        s();
      },
      // Baja limpia: retira el listener de `document`. Sin esto habría fuga.
      r: () => {
        trace('r() shopping-cart: baja del listener de bus en document', 'cart');
        $n0 = null; $n1 = null; $n2 = null; $shadow = null;
        $d.forEach((d) => d());
      },
    };
  }
};

customElements.define('shopping-cart', cl);
