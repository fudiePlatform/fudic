// components/app-note.js — tercer chunk N3, mismo patrón.
// Se usa para medir INP en cache-miss: su warm está desactivado, así que
// el primer click paga red (import sin cache previa).

function signal(v) {
  const subs = new Set();
  const s = () => v;
  s.peek = () => v;
  s.set = (n) => { if (n === v) return; v = n; for (const fn of subs) fn(v); };
  s.subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  return s;
}

class AppNote extends HTMLElement {
  connectedCallback() {
    const st = window.__fudState[this.dataset.id];
    const n = signal(st.n);
    const out = this.shadowRoot.querySelector('[data-out]');
    const btn = this.shadowRoot.querySelector('[data-btn]');
    n.subscribe(v => out.textContent = v);
    out.textContent = n.peek();
    btn.addEventListener('click', () => n.set(n.peek() + 1));
    this.setAttribute('data-hydrated', '');
  }
}

export default ((tag, Constructor) =>
  () => { if (!customElements.get(tag)) customElements.define(tag, Constructor); }
)('app-note', AppNote);
