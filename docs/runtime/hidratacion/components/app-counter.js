// components/app-counter.js — chunk REAL, componente N3.
// Refleja lo que emitiría el compilador desde:
//   @client { const count = signal(value); function click(ev){ count.set(count.peek()+1) } }
//   <button @click="@click">
//
// El handler es un método de la clase, registrado con addEventListener en
// connectedCallback sobre el elemento del @click. Recibe el `ev` real: el
// usuario puede llamar ev.stopPropagation()/preventDefault() con normalidad.
// El runtime NO interviene una vez el componente está definido.

class AppCounter extends HTMLElement {
  #count = 0;
  #span = null;

  connectedCallback() {
    const root = this.shadowRoot;
    if (!root) return;

    // Estado inicial desde el payload por data-id (nunca del DOM).
    const id = this.getAttribute('data-id');
    const state = (window.__fudState && window.__fudState[id]) || { count: 0 };
    this.#count = state.count;

    // Adopción posicional del nodo ya renderizado por SSR.
    this.#span = root.querySelector('.n');
    this.#paint();

    // Cableado del @click: listener propio sobre el elemento marcado.
    // (El compilador conoce el elemento del @click; aquí es el button.)
    const btn = root.querySelector('button');
    btn?.addEventListener('click', this.#click);
  }

  // Handler real. Recibe el evento; el usuario controla la propagación.
  #click = (ev) => {
    this.#count++;
    this.#paint();
    this.dispatchEvent(new CustomEvent('fud:change', {
      bubbles: true, composed: true,
      detail: { id: this.getAttribute('data-id'), count: this.#count }
    }));
  };

  #paint() { if (this.#span) this.#span.textContent = String(this.#count); }
}

customElements.define('app-counter', AppCounter);
