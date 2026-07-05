// ============================================================
// Wrapper del DOM — runtime compartido de Fudic
// ============================================================
//
// Una fina indirección sobre las primitivas del DOM. NO es un
// VDOM ni hace diffing: enmascara las primitivas, no la política.
//
// Dos familias de operaciones:
//   - construcción:  crear nodos (browser: DOM real / SSR: string)
//   - adopción:      recorrer nodos existentes para hidratar
//                    (browser-only; en SSR no se hidrata)
//
// El namespace (HTML / SVG / MathML) se resuelve AQUÍ, una vez.


// ── Namespaces ──────────────────────────────────────────────
export const NS = {
  html: 'http://www.w3.org/1999/xhtml',
  svg:  'http://www.w3.org/2000/svg',
  math: 'http://www.w3.org/1998/Math/MathML',
} as const;

export type Ns = keyof typeof NS;


// ── El contrato ─────────────────────────────────────────────
// Genérico en N = tipo de nodo. En browser N = Node (DOM real).
// En SSR N no se usa como árbol: la construcción escribe a buffer.

export interface Dom<N> {
  // construcción (browser y SSR)
  element(tag: string, ns?: Ns): N;
  text(data: string): N;
  comment(data: string): N;
  setAttr(el: N, name: string, value: string): void;
  append(parent: N, child: N): void;
  before(anchor: N, node: N): void;   // anchor.before(node) → dispara connectedCallback
  remove(node: N): void;

  // adopción / traversal (SOLO browser; SSR lanza si se llama)
  firstChild(node: N): N | null;
  nextSibling(node: N): N | null;
  childAt(node: N, index: number): N | null;
}


// ── Implementación browser: DOM real ────────────────────────

export const browserDom: Dom<Node> = {
  element(tag, ns = 'html') {
    return ns === 'html'
      ? document.createElement(tag)
      : document.createElementNS(NS[ns], tag);
  },
  text(data)    { return document.createTextNode(data); },
  comment(data) { return document.createComment(data); },
  setAttr(el, name, value) { (el as Element).setAttribute(name, value); },
  append(parent, child)    { parent.appendChild(child); },
  before(anchor, node)     { (anchor as ChildNode).before(node as Node); },
  remove(node)             { (node as ChildNode).remove(); },

  firstChild(node)  { return node.firstChild; },
  nextSibling(node) { return node.nextSibling; },
  childAt(node, i)  { return node.childNodes[i] ?? null; },
};


// ── Implementación SSR: escribe a un buffer de strings ──────
//
// No construye árbol: acumula la serialización. Un "nodo" aquí
// es solo un marcador; el estado real es el buffer. La adopción
// no existe en SSR → esos métodos lanzan.

export class SsrDom implements Dom<SsrNode> {
  private out: string[] = [];

  html(): string { return this.out.join(''); }

  element(tag: string, _ns: Ns = 'html'): SsrNode {
    // apertura ahora; el cierre lo emite append/end del padre.
    // versión simple: devolvemos un nodo que sabe cerrarse.
    return new SsrNode(this, tag);
  }
  text(data: string): SsrNode      { this.write(escapeHtml(data)); return SsrNode.leaf(this); }
  comment(data: string): SsrNode   { this.write(`<!--${data}-->`); return SsrNode.leaf(this); }

  setAttr(_el: SsrNode, name: string, value: string): void {
    // en SSR los atributos se emiten en la apertura del elemento;
    // en la versión real esto se coordina con element(). Simplificado:
    this.write(` ${name}="${escapeAttr(value)}"`);
  }
  append(parent: SsrNode, child: SsrNode): void {
    parent.closeOpenTag();
    child.flushInto(parent);
  }
  before(_anchor: SsrNode, _node: SsrNode): void {
    // en SSR el orden lo da la escritura secuencial; no hay "before".
    // se resuelve en el emit, no aquí.
  }
  remove(_node: SsrNode): void { /* nada que quitar de un string ya escrito */ }

  // adopción: NO existe en SSR
  firstChild(): never  { throw new Error('SSR no hidrata: firstChild no disponible'); }
  nextSibling(): never { throw new Error('SSR no hidrata: nextSibling no disponible'); }
  childAt(): never     { throw new Error('SSR no hidrata: childAt no disponible'); }

  write(s: string): void { this.out.push(s); }
}

// Nodo SSR minimal: solo lo justo para el ejemplo runnable.
export class SsrNode {
  constructor(private dom: SsrDom, public tag?: string) {
    if (tag) dom.write(`<${tag}`);
    this.openTag = !!tag;
  }
  private openTag = false;
  static leaf(dom: SsrDom) { return new SsrNode(dom); }
  closeOpenTag() { if (this.openTag) { (this.dom as any).write('>'); this.openTag = false; } }
  flushInto(_parent: SsrNode) { /* orden secuencial ya escrito */ }
}


function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
