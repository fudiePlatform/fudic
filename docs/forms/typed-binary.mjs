// Si el schema declara TIPO además de ORDEN, el cable no necesita ni etiquetas ni
// longitudes para los campos de ancho fijo: el lector sabe cuántos bytes leer.
// Solo los de longitud variable (string, array) pagan su contador.

const utf8 = new TextEncoder();
const B = (s) => utf8.encode(s).length;
const varintSize = (n) => { let c = 0; do { n >>>= 7; c++; } while (n); return c; };

// ── coste por tipo declarado ─────────────────────────────────────────────────
const SIZE = {
  bool: 0,          // se empaqueta en un bitfield: 1 byte por cada 8 booleanos
  u8: 1, i8: 1,
  u16: 2, i16: 2,
  u32: 4, i32: 4,
  f32: 4, f64: 8,
  date: 6,          // ms desde epoch en 48 bits: llega hasta el año 10 889
};

// Tamaño de un registro tipado: fijos a pelo, variables con su contador.
function typedSize(fields) {
  let bytes = 0, bools = 0;
  for (const f of fields) {
    if (f.type === 'bool') { bools++; continue; }
    if (f.type === 'str') { bytes += varintSize(B(f.value)) + B(f.value); continue; }
    if (f.type === 'str[]') {
      bytes += varintSize(f.value.length);
      for (const s of f.value) bytes += varintSize(B(s)) + B(s);
      continue;
    }
    bytes += SIZE[f.type];
  }
  return bytes + Math.ceil(bools / 8);
}

// ── protobuf, para contraste: 1 byte de tag por campo ────────────────────────
function protoSize(fields) {
  let bytes = 0;
  for (const f of fields) {
    if (f.type === 'bool') { bytes += 2; continue; }
    if (f.type === 'str') { bytes += 1 + varintSize(B(f.value)) + B(f.value); continue; }
    if (f.type === 'str[]') { for (const s of f.value) bytes += 1 + varintSize(B(s)) + B(s); continue; }
    bytes += 1 + (f.type.startsWith('f') ? SIZE[f.type] : varintSize(Math.abs(f.value)));
  }
  return bytes;
}

const table = (title, fields, json) => {
  const typed = typedSize(fields), proto = protoSize(fields);
  const payload = fields.filter((f) => f.type === 'str').reduce((a, f) => a + B(f.value), 0)
    + fields.filter((f) => f.type === 'str[]').reduce((a, f) => a + f.value.reduce((x, s) => x + B(s), 0), 0);
  console.log(`\n  ${title}`);
  console.log('  ' + '─'.repeat(56));
  const row = (n, v) => console.log('  ' + n.padEnd(30) + String(v).padStart(6) + ' B'
    + (v === json ? '' : `   −${(100 * (json - v) / json).toFixed(0)} %`));
  row('JSON posicional', json);
  row('protobuf', proto);
  row('schema tipado → TypedArray', typed);
  console.log('  ' + 'texto irreducible'.padEnd(30) + String(payload).padStart(6) + ' B');
};

// ── 1. el formulario del blog: casi todo texto ───────────────────────────────
const post = [
  { type: 'str', value: 'Arquitectura de Fudic' },
  { type: 'str', value: 'Cuerpo del post con algo de texto para que pese.' },
  { type: 'bool', value: true },
  { type: 'str', value: 'Descripción SEO del post' },
  { type: 'str', value: 'https://fudie.eu/blog/x' },
  { type: 'str[]', value: ['web', 'compilador'] },
];
table('formulario de blog (dominado por strings)', post, 158);

// ── 2. una línea de pedido: el caso real de un POS ───────────────────────────
const line = [
  { type: 'u32', value: 918_233 },      // id de artículo
  { type: 'u16', value: 3 },            // cantidad
  { type: 'u32', value: 1_450 },        // precio en céntimos
  { type: 'u8', value: 21 },            // % de IVA
  { type: 'u8', value: 0 },             // % de descuento
  { type: 'bool', value: true },        // para llevar
  { type: 'bool', value: false },       // invitación
  { type: 'bool', value: true },        // impreso en cocina
  { type: 'u16', value: 7 },            // mesa
  { type: 'date', value: Date.now() },  // marca de tiempo
];
const lineJson = JSON.stringify([918233, 3, 1450, 21, 0, true, false, true, 7, Date.now()]);
table('línea de pedido (numérica)', line, B(lineJson));

// ── 3. un ticket de 50 líneas: lo que de verdad viaja en Fudie ───────────────
const n = 50;
const batchJson = B(JSON.stringify(Array.from({ length: n }, () => JSON.parse(lineJson))));
const batchTyped = n * typedSize(line) + varintSize(n);
const batchProto = n * (protoSize(line) + 2);
console.log('\n  ticket de 50 líneas');
console.log('  ' + '─'.repeat(56));
for (const [t, v] of [['JSON posicional', batchJson], ['protobuf', batchProto], ['schema tipado', batchTyped]]) {
  console.log('  ' + t.padEnd(30) + String(v).padStart(6) + ' B'
    + (v === batchJson ? '' : `   −${(100 * (batchJson - v) / batchJson).toFixed(0)} %`));
}
console.log();
