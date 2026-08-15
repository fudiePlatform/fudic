// ¿A partir de qué tamaño compensa compress el array posicional?
// Texto de sampleForm realista (prose española), no cadenas aleatorias:
// lo aleatorio es incomprimible y le quitaría a gzip lo que sí gana en producción.

const utf8 = new TextEncoder();
const B = (s) => utf8.encode(s).length;

const compress = async (t, f) => {
  const cs = new CompressionStream(f);
  const w = cs.writable.getWriter();
  w.write(utf8.encode(t)); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer()).length;
};

const VOCAB = ('el compilador emite html con shadow dom declarativo y cero javascript hasta '
  + 'que el usuario interactúa la hidratación es por instancia y la descarga por tag el '
  + 'sampleForm valida en cliente y en servidor con el mismo esquema compartido sin '
  + 'duplicar reglas ni serializar etiquetas por el wire en cada petición').split(' ');

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const prose = (n) => Array.from({ length: n }, () => VOCAB[Math.floor(rnd() * VOCAB.length)]).join(' ');

// Un sampleForm posicional cuyo peso se controla por la longitud del cuerpo.
const sampleForm = (words) => [
  prose(4), prose(words), rnd() > 0.5,
  [prose(6), `https://fudie.eu/blog/${prose(2).replace(/ /g, '-')}`],
  [VOCAB[Math.floor(rnd() * 20)], VOCAB[Math.floor(rnd() * 20)]],
];

// Genera un wire de aproximadamente `target` bytes.
function wire(target) {
  // Por debajo de un sampleForm completo se recorta el cuerpo, no se repite.
  // Por debajo de un sampleForm completo: formularios cortos reales
  // (un comentario, una búsqueda, un login), no el post entero.
  if (target < 180) {
    seed = 7;
    const texto = prose(60);
    for (let n2 = 1; n2 <= texto.length; n2++) {
      const s0 = JSON.stringify([texto.slice(0, n2), true]);
      if (B(s0) >= target) return s0;
    }
  }
  let n = 1, s = JSON.stringify([sampleForm(6)]);
  while (B(s) < target && n < 4000) { n++; seed = 7 + n; s = JSON.stringify(Array.from({ length: n }, (_, i) => (seed = 7 + i * 13, sampleForm(6)))); }
  return s;
}

const SIZES = [40, 60, 80, 100, 120, 140, 160, 200, 260, 350, 500, 700, 1000, 1500, 2500, 4000, 8000, 16000, 40000];

console.log('\n   JSON      gzip    ahorro    deflate-raw   ahorro   ¿compensa?');
console.log('  ' + '─'.repeat(66));

let gzipThreshold = null, rawThreshold = null;

for (const t of SIZES) {
  const s = wire(t);
  const n = B(s);
  const g = await compress(s, 'gzip');
  const d = await compress(s, 'deflate-raw');
  const pg = (100 * (n - g) / n), pd = (100 * (n - d) / n);
  if (gzipThreshold === null && pg >= 20) gzipThreshold = n;
  if (rawThreshold === null && pd >= 20) rawThreshold = n;

  const verdict = pg <= 0 ? 'no: engorda' : pg < 10 ? 'no' : pg < 25 ? 'marginal' : 'sí';
  console.log(
    '  ' + String(n).padStart(6) + ' B'
    + String(g).padStart(9) + ' B'
    + (pg <= 0 ? `   +${(-pg).toFixed(0)} %` : `   −${pg.toFixed(0)} %`).padStart(10)
    + String(d).padStart(12) + ' B'
    + `   −${pd.toFixed(0)} %`.padStart(9)
    + '   ' + verdict,
  );
}

console.log('\n  gzip supera el 20 % de ahorro a partir de ~' + gzipThreshold + ' B');
console.log('  deflate-raw lo supera a partir de ~' + rawThreshold + ' B');
console.log('  suelo fijo: gzip 20 B (cabecera 10 + cola 8) · deflate-raw 2 B\n');
