// components/shopping-cart.js
// CHUNK EMITIDO por el compilador desde shopping-cart.fud.
//
// .fud original (lo que el developer ESCRIBE) — SUSCRIPTOR DECLARATIVO:
//
//   @code {
//     @client {
//       import { signal } from '@fudic/dom';
//       const items = signal(0);
//       const total = signal(0);
//       function onCarrito(ev) {
//         items.set(items.peek() + 1);
//         total.set(total.peek() + ev.detail.precio);
//       }
//     }
//   }
//   <div class="carrito" @carrito="@onCarrito(ev)">
//     <span class="badge">@items.value</span>
//     <span class="importe">@total.value €</span>
//   </div>
//
// El @carrito="@onCarrito(ev)" en el TEMPLATE es lo que el parser HTML lee
// para saber: escucha 'carrito' -> shopping-cart. De aquí sale fud-bus.
//
// IMPORTANTE (modelo de eventos): emisor y suscriptor son HERMANOS. El
// @carrito NO se registra sobre el propio host —un evento que burbujea desde
// un hermano nunca entra aquí— sino sobre el ANCESTRO COMÚN (document/#app).
// El compilador conoce la composición de página y desugariza @carrito a un
// listener sobre ese ancestro, con el host como contexto del handler.

import { signal } from '../fudic-dom.js';

class ShoppingCart extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });

    // Estado leído del payload por data-id (autoridad de estado, no el DOM).
    const id = this.getAttribute('data-id');
    const initial = (window.__fudState && window.__fudState[id]) || { items: 0, total: 0 };

    const items = signal(initial.items);
    const total = signal(initial.total);

    if (!root.querySelector('.carrito')) {
      root.innerHTML =
        `<div class="carrito">
           <span class="badge">${items.peek()}</span>
           <span class="importe">${total.peek().toFixed(2)} €</span>
         </div>`;
    }
    const badge = root.querySelector('.badge');
    const importe = root.querySelector('.importe');

    // Los @items.value / @total.value del template -> suscripciones fine-grained.
    items.subscribe(v => { badge.textContent = v; });
    total.subscribe(v => { importe.textContent = v.toFixed(2) + ' €'; });

    // El @carrito="@onCarrito(ev)" del host -> addEventListener sobre el ANCESTRO COMÚN.
    //
    // CLAVE DEL MODELO: emisor y suscriptor son HERMANOS. Un CustomEvent que
    // burbujea desde <product-list> sube por SUS ancestros (product-list -> #app
    // -> document), NUNCA entra en <shopping-cart> (no es ancestro del emisor).
    // Por eso el suscriptor escucha en el ancestro común de la página (document),
    // filtrando por tipo de evento. El compilador conoce la composición y sabe
    // cuál es el ancestro común; aquí es `document`.
    //
    // Se registra en connectedCallback: por eso el runtime debe hidratar ESTE
    // componente ANTES que el emisor, o el primer 'carrito' no tendría oyente.
    document.addEventListener('carrito', (ev) => {
      items.set(items.peek() + 1);
      total.set(total.peek() + ev.detail.precio);
      document.dispatchEvent(new CustomEvent('fud:log', {
        detail: { line: `carrito recibido: ${ev.detail.nombre} (+${ev.detail.precio.toFixed(2)}€) → items=${items.peek()} total=${total.peek().toFixed(2)}€` }
      }));
    });
  }
}
customElements.define('shopping-cart', ShoppingCart);
