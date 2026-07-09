// components/product-list.js
// CHUNK EMITIDO por el compilador desde product-list.fud.
// Representa el @client del developer + el markup, compilado a un custom element.
//
// .fud original (lo que el developer ESCRIBE):
//
//   @code {
//     type Producto = { id: string; nombre: string; precio: number };
//     @client {
//       import { emit } from '@fudic/dom';
//       const productos: Producto[] = [ ... ];
//       function añadir(p: Producto) { emit('carrito', p); }   // this === host
//     }
//   }
//   <ul class="lista">
//     @foreach (const p of productos) {
//       <li><span>@p.nombre</span><span>@p.precio €</span>
//         <button @click="@(() => añadir(p))">Añadir</button></li>
//     }
//   </ul>

import { emit } from '../fudic-dom.js';

class ProductList extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });

    // Estado leído del payload por data-id (autoridad de estado, no el DOM
    // ni una constante embebida en el chunk). El compilador serializó la
    // lista `productos` del @client en fud-state['list-1'].
    const id = this.getAttribute('data-id');
    const state = (window.__fudState && window.__fudState[id]) || { productos: [] };
    const productos = state.productos;

    // Hidratación posicional: el SSR ya pintó los <li>. Adoptamos, no recreamos.
    // Aquí (SSR real) los botones ya existen; registramos el listener propio.
    // Para la demo, si el shadow viene vacío, lo poblamos una vez.
    if (!root.querySelector('.lista')) {
      const ul = document.createElement('ul');
      ul.className = 'lista';
      for (const p of productos) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.nombre}</span><span>${p.precio.toFixed(2)} €</span>`;
        const btn = document.createElement('button');
        btn.textContent = 'Añadir';
        btn.dataset.pid = p.id;
        li.appendChild(btn);
        ul.appendChild(li);
      }
      root.appendChild(ul);
    }
    // El @click="@(() => añadir(p))" del developer -> listener propio del host.
    // Corre en BURBUJEO. El capturador global (runtime) está en CAPTURA.
    root.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-pid]');
      if (!btn) return;
      const p = productos.find(x => x.id === btn.dataset.pid);
      // añadir(p) del developer, compilado: emit('carrito', p) con this === host.
      emit.call(this, 'carrito', p);
    });
  }
}
customElements.define('product-list', ProductList);
