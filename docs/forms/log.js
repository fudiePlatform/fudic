// Formato de la evidencia. Un único console.log por caso: así la consola muestra
// un prefijo, no ocho, y nada se colapsa en {…} ni en Array(2).

const W = 62;
const rule = (c = '─') => c.repeat(W);

// Los objetos se imprimen serializados. Un objeto pasado a console.log se
// muestra plegado y hay que abrirlo a mano; eso es justo lo que estorba aquí.
const fmt = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

export const bytes = (s) => new TextEncoder().encode(s).length;

export function Block(n, title, claim) {
  const L = [];
  L.push(`${n} · ${title}`);
  L.push(rule('═'));
  if (claim) L.push(claim, '');

  return {
    line: (k, v) => (L.push(k ? `  ${k.padEnd(11)} ${fmt(v)}` : ''), undefined),
    sub: (t) => (L.push('', `  ${t}`, `  ${rule('╌').slice(0, W - 2)}`), undefined),
    request: (req) => {
      L.push('', `  → ${req.method} ${req.url}`);
      for (const [k, v] of Object.entries(req.headers)) L.push(`    ${k}: ${v}`);
      L.push(`    ${req.body ?? '(sin body)'}`);
      L.push(`    ${bytes(req.body ?? '')} B${req.positional ? '   ← posicional, sin etiquetas' : ''}`);
      return undefined;
    },
    response: (res) => (L.push('', `  ← ${res.status} ${res.body ? fmt(res.body) : ''}`), undefined),
    verdict: (ok, texto) => (L.push('', `  ${ok ? '✓' : '✗'} ${texto}`), ok),
    end: () => {
      L.push(rule(), '');
      console.log(L.join('\n'));
    },
  };
}

export function header(t) {
  console.log(`\n${rule('█')}\n  ${t}\n${rule('█')}\n`);
}

// ── volcado hexadecimal del búfer ────────────────────────────────────────────────────────
// 16 bytes por fila: offset, hex, y columna ASCII con punto para lo no imprimible.
export function hexDump(u8, max = 512) {
  const n = Math.min(u8.length, max);
  const rows = [];
  for (let i = 0; i < n; i += 16) {
    const chunk = u8.subarray(i, Math.min(i + 16, n));
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·')).join('');
    rows.push(`  ${i.toString(16).padStart(4, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (u8.length > n) rows.push(`  …    ${u8.length - n} bytes más`);
  return rows.join('\n');
}

