class AppParent extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const id = this.getAttribute('data-id');
    const st = (window.__fudState && window.__fudState[id]) || { count: 0, label: '?' };
    let count = st.count;
    const out = root.querySelector('.count');
    root.addEventListener('click', (ev) => {
      if (!ev.target.closest('button')) return;
      count += 1;
      if (out) out.textContent = count;
      document.dispatchEvent(new CustomEvent('fud:log',
        { detail: { line: `handler del padre corre → count=${count} (todo el subárbol ya vivo)` } }));
    });
    document.dispatchEvent(new CustomEvent('fud:log',
      { detail: { line: `    · connectedCallback padre #${id} (estado: count=${count})` } }));
  }
}
customElements.define('app-parent', AppParent);
