// components/app-counter.js — chunk N3. Top-level solo declara.

function signal(v) {
  const subs = new Set();
  const s = () => v;
  s.peek = () => v;
  s.set = (n) => { if (n === v) return; v = n; for (const fn of subs) fn(v); };
  s.subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  return s;
}

class AppCounter extends HTMLElement {
  connectedCallback() {
    const st = window.__fudState[this.dataset.id];
    const count = signal(st.count);
    const out = this.shadowRoot.querySelector('[data-out]');
    const inc = this.shadowRoot.querySelector('[data-inc]');
    const dec = this.shadowRoot.querySelector('[data-dec]');
    count.subscribe(v => out.textContent = v);
    out.textContent = count.peek();
    inc.addEventListener('click', () => count.set(count.peek() + 1));
    dec.addEventListener('click', () => count.set(count.peek() - 1));
    this.setAttribute('data-hydrated', '');   // señal visual de que ya está vivo
  }
}

export default ((tag, Constructor) =>
  () => { if (!customElements.get(tag)) customElements.define(tag, Constructor); }
)('app-counter', AppCounter);
