// components/app-toggle.js — segundo chunk N3, mismo patrón.

function signal(v) {
  const subs = new Set();
  const s = () => v;
  s.peek = () => v;
  s.set = (n) => { if (n === v) return; v = n; for (const fn of subs) fn(v); };
  s.subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  return s;
}

class AppToggle extends HTMLElement {
  connectedCallback() {
    const st = window.__fudState[this.dataset.id];
    const on = signal(st.on);
    const knob = this.shadowRoot.querySelector('[data-knob]');
    const label = this.shadowRoot.querySelector('[data-label]');
    const btn = this.shadowRoot.querySelector('[data-btn]');
    const paint = (v) => {
      knob.setAttribute('data-on', v ? '' : 'off');
      knob.toggleAttribute('data-active', v);
      label.textContent = v ? 'ON' : 'OFF';
    };
    on.subscribe(paint);
    paint(on.peek());
    btn.addEventListener('click', () => on.set(!on.peek()));
    this.setAttribute('data-hydrated', '');
  }
}

export default ((tag, Constructor) =>
  () => { if (!customElements.get(tag)) customElements.define(tag, Constructor); }
)('app-toggle', AppToggle);
