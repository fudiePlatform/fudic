// ¿Qué ocupa cada tipo de JS en un búfer binario con etiqueta + longitud?
// Codificador mínimo para medir, no para proponer nada todavía.

const T = {
  NULL: 0, FALSE: 1, TRUE: 2,          // el valor cabe en la propia etiqueta
  I8: 3, I16: 4, I32: 5, F64: 6,       // Number, según quepa
  BIGINT: 7, STR: 8, ARR: 9,
};

// varint LEB128: 1 byte hasta 127, 2 hasta 16 383, 3 hasta 2 097 151
const varint = (n) => { const o = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n); return o; };

const utf8 = new TextEncoder();

function encode(v, out = []) {
  if (v === null || v === undefined) { out.push(T.NULL); return out; }

  if (typeof v === 'boolean') { out.push(v ? T.TRUE : T.FALSE); return out; }

  if (typeof v === 'number') {
    if (Number.isInteger(v)) {
      if (v >= -128 && v <= 127) { out.push(T.I8, v & 0xff); return out; }
      if (v >= -32768 && v <= 32767) { out.push(T.I16, v & 0xff, (v >> 8) & 0xff); return out; }
      if (v >= -2147483648 && v <= 2147483647) {
        out.push(T.I32); const d = new DataView(new ArrayBuffer(4)); d.setInt32(0, v);
        for (let i = 0; i < 4; i++) out.push(d.getUint8(i)); return out;
      }
    }
    out.push(T.F64); const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, v);
    for (let i = 0; i < 8; i++) out.push(d.getUint8(i)); return out;
  }

  if (typeof v === 'bigint') {
    let h = (v < 0n ? -v : v).toString(16); if (h.length % 2) h = '0' + h;
    const b = h.match(/../g).map((x) => parseInt(x, 16));
    out.push(T.BIGINT, v < 0n ? 1 : 0, ...varint(b.length), ...b); return out;
  }

  if (typeof v === 'string') {
    const b = utf8.encode(v); out.push(T.STR, ...varint(b.length), ...b); return out;
  }

  if (Array.isArray(v)) {
    out.push(T.ARR, ...varint(v.length)); for (const x of v) encode(x, out); return out;
  }

  // objeto plano: claves como strings. Es justo lo que el posicional elimina.
  const ks = Object.keys(v);
  out.push(T.ARR, ...varint(ks.length * 2));
  for (const k of ks) { encode(k, out); encode(v[k], out); }
  return out;
}

const binSize = (v) => encode(v).length;
// JSON.stringify LANZA con BigInt: no es serializable, no es que ocupe mucho.
const jsonSize = (v) => { try { return utf8.encode(JSON.stringify(v)).length; } catch { return null; } };

// ── tabla por tipo ───────────────────────────────────────────────────────────
const row = (t, v, note) => {
  const b = binSize(v), j = jsonSize(v);
  console.log(
    '  ' + t.padEnd(22) +
    String(b).padStart(6) + ' B' +
    (j === null ? '    lanza' : String(j).padStart(9) + ' B') +
    '   ' + note,
  );
};

console.log('\n  tipo                    binario     JSON');
console.log('  ' + '─'.repeat(62));
row('Null', null, 'etiqueta sola');
row('Boolean false', false, 'valor dentro de la etiqueta');
row('Boolean true', true, 'valor dentro de la etiqueta');
row('Number 0..127', 42, 'etiqueta + 1');
row('Number 32767', 32767, 'etiqueta + 2');
row('Number 2_000_000', 2_000_000, 'etiqueta + 4');
row('Number 3.14159', 3.14159, 'etiqueta + 8 (float64)');
row('Number 1e21', 1e21, 'etiqueta + 8');
row('BigInt 2n**64n', 2n ** 64n, 'etiqueta+signo+long+9 · JSON no puede');
row('BigInt 255n', 255n, 'etiqueta+signo+long+1 · JSON no puede');
row('String ""', '', 'etiqueta + long');
row('String "Pedro"', 'Pedro', 'etiqueta + long + 5');
row('String 200 chars', 'x'.repeat(200), 'long ocupa 2 bytes');
row('String "ñ"', 'ñ', 'UTF-8: 2 bytes');
row('Array vacío', [], 'etiqueta + cuenta');
row('Array [1,"Pedro"]', [1, 'Pedro'], '');
row('Objeto {id,name}', { id: 1, name: 'Pedro' }, 'las claves son strings');

// ── el fixture real ──────────────────────────────────────────────────────────
const post = {
  title: 'Arquitectura de Fudic',
  body: 'Cuerpo del post con algo de textBytes para que pese.',
  published: true,
  seo: { description: 'Descripción SEO del post', canonical: 'https://fudie.eu/blog/x' },
  tags: ['web', 'compilador'],
};
const pos = ['Arquitectura de Fudic', 'Cuerpo del post con algo de textBytes para que pese.', true,
  ['Descripción SEO del post', 'https://fudie.eu/blog/x'], ['web', 'compilador']];

console.log('\n  el fixture de blog.form.js');
console.log('  ' + '─'.repeat(62));
const rows = [
  ['JSON con claves', jsonSize(post)],
  ['JSON posicional', jsonSize(pos)],
  ['binario con claves', binSize(post)],
  ['binario posicional', binSize(pos)],
];
for (const [n, b] of rows) console.log('  ' + n.padEnd(22) + String(b).padStart(6) + ' B');

const textBytes = utf8.encode(pos.flat(Infinity).filter((x) => typeof x === 'string').join('')).length;
console.log('  ' + 'de eso, textBytes puro'.padEnd(22) + String(textBytes).padStart(6) + ' B'
  + `   ← ${(100 * textBytes / binSize(pos)).toFixed(0)} % del binario es carga útil`);

// ── un caso numérico, donde el binario sí cambia las cosas ───────────────────
const floats = Array.from({ length: 200 }, (_, i) => i * 3.5);
const ints = Array.from({ length: 200 }, (_, i) => i);
console.log('\n  200 valores numéricos');
console.log('  ' + '─'.repeat(62));
console.log('  ' + 'float64 · JSON'.padEnd(22) + String(jsonSize(floats)).padStart(6) + ' B');
console.log('  ' + 'float64 · binario'.padEnd(22) + String(binSize(floats)).padStart(6) + ' B');
console.log('  ' + 'ints 0..199 · JSON'.padEnd(22) + String(jsonSize(ints)).padStart(6) + ' B');
console.log('  ' + 'ints 0..199 · binario'.padEnd(22) + String(binSize(ints)).padStart(6) + ' B');
console.log();
