// Segundo chunk N3, mismo patrón, otra forma. Prueba de polimorfismo de módulo.

function signal(v) {
  const subs = new Set();
  const s = () => v;
  s.peek = () => v;
  s.set = (n) => { if (n === v) return; v = n; for (const fn of subs) fn(v); };
  s.subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  return s;
}

class AppPanel extends HTMLElement {
  connectedCallback() {
    const st = window.__fudState[this.dataset.id];        // su propio data-id
    const open = signal(st.open);
    const h = this.shadowRoot.querySelector('[data-label]');
    const body = this.shadowRoot.querySelector('[data-body]');
    const btn = this.shadowRoot.querySelector('[data-toggle]');
    h.textContent = st.label;
    open.subscribe(v => body.hidden = !v);
    body.hidden = !open.peek();
    btn.addEventListener('click', () => open.set(!open.peek()));
  }
}

export default ((tag, Constructor) =>
  () => { if (!customElements.get(tag)) customElements.define(tag, Constructor); }
)('app-panel', AppPanel);
