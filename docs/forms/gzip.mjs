// ¿Compensa compress el body? CompressionStream, medido, no estimado.

const utf8 = new TextEncoder();

async function compress(texto, formato) {
  const cs = new CompressionStream(formato);
  const w = cs.writable.getWriter();
  w.write(utf8.encode(texto));
  w.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function decompress(bytes, formato) {
  const ds = new DecompressionStream(formato);
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Response(ds.readable).text();
}

// ── formatos disponibles ─────────────────────────────────────────────────────
console.log('\n  formatos que acepta CompressionStream');
console.log('  ' + '─'.repeat(64));
for (const f of ['gzip', 'deflate', 'deflate-raw', 'br', 'brotli', 'zstd']) {
  try { new CompressionStream(f); console.log(`  ${f.padEnd(14)} sí`); }
  catch (e) { console.log(`  ${f.padEnd(14)} no  (${e.constructor.name})`); }
}

const post = {
  title: 'Arquitectura de Fudic',
  body: 'Cuerpo del post con algo de texto para que pese.',
  published: true,
  seo: { description: 'Descripción SEO del post', canonical: 'https://fudie.eu/blog/x' },
  tags: ['web', 'compilador'],
};
const pos = ['Arquitectura de Fudic', 'Cuerpo del post con algo de texto para que pese.', true,
  ['Descripción SEO del post', 'https://fudie.eu/blog/x'], ['web', 'compilador']];

// Repetir 50 veces el MISMO formulario le regala a gzip una redundancia que en
// producción no existe. Se generan variados.
const varied = (i) => ({
  title: `Post número ${i} sobre ${['SSR', 'compiladores', 'shadow DOM', 'hidratación'][i % 4]}`,
  body: `Cuerpo distinto del post ${i}: ${Math.random().toString(36).slice(2, 30)}`,
  published: i % 3 !== 0,
  seo: {
    description: `Descripción SEO ${i} — ${Math.random().toString(36).slice(2, 14)}`,
    canonical: `https://fudie.eu/blog/post-${i}-${Math.random().toString(36).slice(2, 8)}`,
  },
  tags: [['web', 'compilador', 'ssr', 'dsd'][i % 4], ['edge', 'wasm'][i % 2]],
});

const toPositional = (o) => [o.title, o.body, o.published, [o.seo.description, o.seo.canonical], o.tags];

const B = (s) => utf8.encode(s).length;

async function table(title, n) {
  const data = n === 1 ? [post] : Array.from({ length: n }, (_, i) => varied(i));
  const keyed = JSON.stringify(n === 1 ? post : data);
  const positional = JSON.stringify(n === 1 ? pos : data.map(toPositional));

  const gzKeyed = await compress(keyed, 'gzip');
  const gzPositional = await compress(positional, 'gzip');
  const rawPositional = await compress(positional, 'deflate-raw');

  console.log(`\n  ${title}`);
  console.log('  ' + '─'.repeat(64));
  const row = (n2, v, ref) => console.log(
    '  ' + n2.padEnd(30) + String(v).padStart(7) + ' B' +
    (ref ? String(`${v > ref ? '+' : '−'}${Math.abs(100 * (v - ref) / ref).toFixed(1)} %`).padStart(11) : ''),
  );
  const base = B(keyed);
  row('JSON con claves', base);
  row('JSON con claves + gzip', gzKeyed.length, base);
  row('JSON posicional', B(positional), base);
  row('JSON posicional + gzip', gzPositional.length, base);
  row('JSON posicional + deflate-raw', rawPositional.length, base);

  const back = await decompress(gzPositional, 'gzip');
  console.log('  ' + 'roundtrip íntegro'.padEnd(30) + String(back === positional).padStart(9));
}

await table('1 formulario', 1);
await table('10 formularios DISTINTOS', 10);
await table('50 formularios DISTINTOS', 50);

// ── cuánto de eso es puro sobre-coste del contenedor ─────────────────────────
const emptyGzip = await compress('', 'gzip');
const emptyRaw = await compress('', 'deflate-raw');
console.log('\n  suelo de cada formato (comprimiendo cadena vacía)');
console.log('  ' + '─'.repeat(64));
console.log('  ' + 'gzip'.padEnd(30) + String(emptyGzip.length).padStart(7) + ' B   cabecera 10 + cola 8');
console.log('  ' + 'deflate-raw'.padEnd(30) + String(emptyRaw.length).padStart(7) + ' B   sin cabecera ni CRC');
console.log();
