class AppGreatgrandchild extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const id = this.getAttribute('data-id');
    const st = (window.__fudState && window.__fudState[id]) || { label: '?' };
    document.dispatchEvent(new CustomEvent('fud:log',
      { detail: { line: `    · connectedCallback bisnieto #${id} (estado: ${st.label})` } }));
  }
}
customElements.define('app-greatgrandchild', AppGreatgrandchild);
