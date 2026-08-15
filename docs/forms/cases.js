// Los diez casos. Cada uno enuncia qué afirma, muestra la evidencia y da veredicto.

import { configure, use, get, put, del, recordingTransport } from './http.js';
import { postForm } from './blog.form.js';
import { form, control } from './forms.js';
import { Put } from './server.js';
import { Block, bytes, header } from './log.js';

const transport = recordingTransport({ PUT: Put });

configure({
  baseURL: '/',
  form: ['/blog/**'],        // ← única configuración necesaria
  transport,
});

use({ method: ['POST', 'PUT', 'PATCH', 'DELETE'] }, (req, next) => {
  req.headers['x-request-id'] = 'req-' + Math.random().toString(36).slice(2, 8);
  return next(req);
});

// El slice declara sus llamadas una vez, importando solo los verbos que usa.
const updatePost = put('/blog/:slug');
const readPost = get('/blog/:slug');
const dropPost = del('/blog/:slug');
const updateExternal = put('/externo/:slug');

const LABELS = ['title', 'body', 'published', 'seo', 'description', 'canonical', 'tags'];
const hasLabels = (s) => LABELS.some((k) => s.includes(`"${k}"`));

const filled = () => {
  const f = postForm();
  f.$value = {
    title: 'Arquitectura de Fudic',
    body: 'Cuerpo del post con algo de texto para que pese.',
    published: true,
    seo: { description: 'Descripción SEO del post', canonical: 'https://fudie.eu/blog/x' },
    tags: ['web', 'compilador'],
  };
  return f;
};

// Form auxiliar del caso 10: controles que guardan estructuras, no escalares.
const emptyNested = () => form({ created: control(), meta: control(), list: control() });

const nested = () => {
  const f = emptyNested();
  f.created.value = new Date('2026-08-10T00:00:00Z');
  f.meta.value = { x: 1, y: undefined, z: { w: undefined, k: [1, undefined, 3] }, fn: () => {} };
  f.list.value = [{ id: 1, nick: undefined }, undefined];
  return f;
};

export const cases = {

  async positional() {
    const b = Block(1, 'PUT dentro de la allowlist',
      '  Afirmo: el body sale como array posicional, sin una sola etiqueta.');
    const f = filled();
    b.line('$value', f.$value);
    b.line('$positional', f.$positional);
    const res = await updatePost(f, { params: { slug: 'arquitectura-de-fudic' } });
    b.request(transport.last);
    b.response(res);
    b.verdict(!hasLabels(transport.last.body) && transport.last.positional,
      'application/fud, array puro, ninguna clave del schema en el cable');
    b.end();
  },

  async outsideAllowlist() {
    const b = Block(2, 'la misma llamada a una URL fuera de la allowlist',
      '  Afirmo: sin la URL en la lista, el body sale como JSON con claves.');
    b.line('allowlist', ['/blog/**']);
    b.line('URL', '/externo/:slug   → no casa');
    const res = await updateExternal(filled(), { params: { slug: 'arquitectura-de-fudic' } });
    b.request(transport.last);
    b.response(res);
    b.verdict(hasLabels(transport.last.body) && !transport.last.positional,
      'application/json con claves: el posicional es opt-in por URL');
    b.end();
  },

  async savings() {
    const b = Block(3, 'cuánto se ahorra',
      '  Afirmo: el array pesa menos que el objeto, y la diferencia crece con los campos.');
    const f = filled();
    const keyed = JSON.stringify(f.$value);
    const positional = JSON.stringify(f.$positional);
    b.line('con claves', `${bytes(keyed)} B`);
    b.line('posicional', `${bytes(positional)} B`);
    b.line('ahorro', `${(100 * (bytes(keyed) - bytes(positional)) / bytes(keyed)).toFixed(1)} %`);
    b.sub('a escala: un lote de 50 formularios');
    const batch = (n, v) => JSON.stringify(Array.from({ length: n }, () => v));
    b.line('con claves', `${bytes(batch(50, f.$value))} B`);
    b.line('posicional', `${bytes(batch(50, f.$positional))} B`);
    b.verdict(bytes(positional) < bytes(keyed), 'las etiquetas se pagaban una vez por instancia');
    b.end();
  },

  async roundtrip() {
    const b = Block(4, 'roundtrip cliente → cable → servidor',
      '  Afirmo: el servidor reconstruye el $value exacto sin recibir un solo nombre.');
    const client = filled();
    const wire = JSON.stringify(client.$positional);
    const server = postForm();
    server.$positional = JSON.parse(wire);
    b.line('cable', wire);
    b.line('cliente', client.$value);
    b.line('servidor', server.$value);
    b.verdict(JSON.stringify(client.$value) === JSON.stringify(server.$value),
      'idénticos. El orden lo dio Object.keys(schema) en los dos lados');
    b.end();
  },

  async validation() {
    const b = Block(5, 'la validación no se entera de la codificación',
      '  Afirmo: el 422 sale de $errors/$summary igual que con JSON con claves.');
    const f = filled();
    f.title.value = 'ocupado';        // dispara el validator.server
    f.seo.description.value = '';     // dispara el summary
    const res = await updatePost(f, { params: { slug: 'ocupado' } });
    b.request(transport.last);
    b.response(res);
    b.verdict(res.status === 422 && !!res.body.errors.title,
      'el posicional es transporte; la validación es la de siempre');
    b.end();
  },

  async arity() {
    const b = Block(6, 'aridad fija',
      '  Afirmo: nada se omite, y una longitud incorrecta es error, no corrupción.');
    const f = postForm();
    b.line('form vacío', f.$positional);
    b.line('', 'false y "" ocupan su hueco; el group vacío sigue siendo su array');
    let err = null;
    try { f.$positional = ['solo', 'dos']; } catch (e) { err = e; }
    b.sub('asignando 2 valores a un schema de 5 campos');
    b.line('resultado', `${err?.constructor.name}: ${err?.message}`);
    b.verdict(err instanceof RangeError && f.$positional.length === 5,
      'RangeError, y el form quedó intacto: sin asignación desplazada');
    b.end();
  },

  async noBody() {
    const b = Block(7, 'GET y DELETE',
      '  Afirmo: la allowlist no les afecta, porque no llevan body.');
    await readPost(undefined, { params: { slug: 'arquitectura-de-fudic' } });
    b.request(transport.last);
    const getHasNoType = !transport.last.headers['content-type'];
    await dropPost(undefined, { params: { slug: 'arquitectura-de-fudic' } });
    b.request(transport.last);
    b.verdict(getHasNoType && !transport.last.body,
      'sin body y sin content-type. QUERY, cuando llegue, va por aquí');
    b.end();
  },

  async notAForm() {
    const b = Block(8, 'un body que no es un form',
      '  Afirmo: aunque la URL case, un objeto suelto sale con claves.');
    b.line('por qué', 'sin schema compartido, un array desnudo no es interpretable');
    const res = await updatePost(
      { title: 'suelto', body: '', published: false, seo: { description: '', canonical: '' }, tags: [] },
      { params: { slug: 'suelto' } });
    b.request(transport.last);
    b.response(res);
    b.verdict(!transport.last.positional && hasLabels(transport.last.body),
      'las tres condiciones son Y: verbo con body, URL en la lista, y body form');
    b.end();
  },

  async undefinedValues() {
    const b = Block(9, 'controles en undefined',
      '  Afirmo: undefined no existe en la frontera. null es el vacío canónico.');
    b.line('el riesgo', 'JSON.stringify borra la clave en un objeto y da null en un array');
    b.line('objeto', JSON.stringify({ a: 'a', b: undefined, c: false }) + '   ← campo b perdido');
    b.line('array', JSON.stringify(['a', undefined, false]) + '   ← posición conservada');

    b.sub('un form al que se le asignan undefined explícitos');
    const f = postForm();
    f.$value = { title: undefined, body: undefined, published: undefined, seo: undefined, tags: undefined };
    b.line('$positional', f.$positional);
    b.line('$value', f.$value);

    const wire = JSON.stringify(f.$positional);
    const server = postForm();
    server.$positional = JSON.parse(wire);
    b.line('cable', wire);
    b.line('servidor', server.$value);

    b.sub('reenviando lo recibido');
    const again = JSON.stringify(server.$positional);
    b.line('2ª vuelta', again);

    const noUndefined = !f.$positional.flat(Infinity).some((v) => v === undefined);
    b.verdict(noUndefined && f.$positional.length === 5 && wire === again,
      'aridad intacta, sin undefined, y el reenvío da el mismo cable: idempotente');
    b.end();
  },

  async deepNormalization() {
    const b = Block(10, 'normalización en profundidad',
      '  Afirmo: dentro del valor de un control tampoco sobrevive un undefined.');
    b.line('el riesgo', 'un control con un objeto dentro: JSON borra sus claves undefined');

    const f = nested();
    b.sub('lo que el usuario asigna');
    b.line('meta', '{ x:1, y:undefined, z:{ w:undefined, k:[1,undefined,3] }, fn:()=>{} }');
    b.line('list', '[ { id:1, nick:undefined }, undefined ]');
    b.line('created', 'new Date(...)   ← tiene toJSON propio, pasa tal cual');

    b.sub('lo que sale por el cable');
    const wire = JSON.stringify(f.$positional);
    b.line('cable', wire);

    const server = emptyNested();
    server.$positional = JSON.parse(wire);
    b.line('servidor', server.$value);

    b.sub('comprobaciones');
    const noLoss = wire.includes('"y":null') && wire.includes('"w":null') && wire.includes('"nick":null');
    b.line('claves', noLoss ? 'y, w, nick sobreviven como null' : 'PERDIDAS');
    const idempotent = JSON.stringify(server.$positional) === wire;
    b.line('2ª vuelta', idempotent ? 'idéntica' : 'DIVERGE');

    const original = { y: undefined };
    const g = emptyNested(); g.meta.value = original; g.$positional;
    const untouched = 'y' in original && original.y === undefined;
    b.line('no muta', untouched ? 'el objeto del usuario queda intacto' : 'MUTADO');

    const cycle = { n: 1 }; cycle.self = cycle;
    const h = emptyNested(); h.meta.value = cycle;
    let cycleErr = null;
    try { h.$positional; } catch (e) { cycleErr = e; }
    b.line('ciclo', cycleErr ? `${cycleErr.constructor.name}: ${cycleErr.message}` : 'NO detectado');

    b.verdict(noLoss && idempotent && untouched && !!cycleErr,
      'sin pérdida a ninguna profundidad, sin mutar al usuario, y el ciclo se diagnostica');
    b.end();
  },
};

export async function all() {
  header('FUDIC · envío posicional de formularios');
  for (const k of Object.keys(cases)) await cases[k]();
}
