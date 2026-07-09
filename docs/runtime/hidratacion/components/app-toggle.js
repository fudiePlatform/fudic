// components/app-toggle.js — chunk REAL, componente N3. Mismo modelo:
// handler real registrado en connectedCallback, recibe ev, runtime se retira.

class AppToggle extends HTMLElement {
  #on = false;
  #pill = null;

  connectedCallback() {
    const root = this.shadowRoot;
    if (!root) return;

    const id = this.getAttribute('data-id');
    const state = (window.__fudState && window.__fudState[id]) || { on: false };
    this.#on = state.on;

    this.#pill = root.querySelector('.pill');
    this.#paint();

    const btn = root.querySelector('button');
    btn?.addEventListener('click', this.#toggle);
  }

  #toggle = (ev) => {
    this.#on = !this.#on;
    this.#paint();
    this.dispatchEvent(new CustomEvent('fud:change', {
      bubbles: true, composed: true,
      detail: { id: this.getAttribute('data-id'), on: this.#on }
    }));
  };

  #paint() {
    if (!this.#pill) return;
    this.#pill.textContent = this.#on ? 'ON' : 'OFF';
    this.#pill.classList.toggle('on', this.#on);
    this.#pill.classList.toggle('off', !this.#on);
  }
}

customElements.define('app-toggle', AppToggle);
