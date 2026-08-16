// @fudic/http
// Cinco factorías independientes, una por verbo. No hay instancia con métodos colgando:
// el slice importa solo el verbo que usa y lo que no se importa no entra en el bundle.

const CFG = {
  baseURL: '/',
  timeout: 10_000,
  middlewares: [],
  form: [],            // allowlist de URLs donde se permite el envío posicional
  compress: null,      // { formato, minimo } — ver §compresión
  transport: null,
};

// ── compresión del body ──────────────────────────────────────────────────────
// El umbral NO es "a partir de qué tamaño el porcentaje es bonito", sino a partir
// de qué tamaño el ahorro en bytes importa frente al resto de la petición.
// Medido sobre un formulario típico: quitar las etiquetas ahorra 66 B (gratis y
// siempre); compress encima ahorra 27 B más, y eso es ruido al lado de las
// cabeceras que la petición ya arrastra sin compress. El ahorro absoluto solo se
// vuelve relevante hacia 1 KB de cuerpo: lotes, colas offline o textos largos.
//
// `Content-Encoding: deflate` significa zlib (RFC 1950), no deflate crudo:
// deflate-raw solo es legítimo cuando el adaptador del otro extremo es el tuyo.
const FLOOR = { gzip: 1000, deflate: 1000, 'deflate-raw': 1000 };

const canCompress = () => typeof CompressionStream === 'function';

async function compress(texto, formato) {
  const cs = new CompressionStream(formato);
  const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(texto));
  w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

export async function decompress(bytes, formato) {
  const ds = new DecompressionStream(formato);
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Response(ds.readable).text();
}

const REGISTERED = [];

export function configure(opts) { Object.assign(CFG, opts); }
export function use(selector, mw) { REGISTERED.push({ selector, mw }); }

// ── matcher de rutas: `*` un segmento, `**` el resto ─────────────────────────
function matches(pattern, url) {
  const rx = new RegExp('^' + pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*') + '$');
  return rx.test(url);
}

const HAS_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Un form de @fudic/forms se reconoce por su API, no por instanceof:
// el form del cliente y el del servidor son objetos distintos del mismo módulo.
const isForm = (b) => !!b && typeof b === 'object'
  && '$positional' in b && '$value' in b && typeof b.$fields === 'function';

function resolve(url, params = {}) {
  const path = url.replace(/:([a-zA-Z_][\w]*)/g, (_, k) => {
    if (!(k in params)) throw new Error(`falta el param :${k}`);
    return encodeURIComponent(params[k]);
  });
  const base = CFG.baseURL.endsWith('/') ? CFG.baseURL.slice(0, -1) : CFG.baseURL;
  return path.startsWith('/') ? base + path : `${base}/${path}`;
}

function chain(method, url, local) {
  const applicable = REGISTERED
    .filter(({ selector: s }) => {
      if (!s) return true;
      const m = s.method ? [].concat(s.method).includes(method) : true;
      const p = s.path ? matches(s.path, url) : true;
      return m && p;
    })
    .map((r) => r.mw);
  return [...CFG.middlewares, ...applicable, ...local];
}

// ── decisión de codificación del body ────────────────────────────────────────
// Tres condiciones Y: el verbo lleva body, la URL está en la allowlist,
// y el body es un form. Si falla una, JSON con claves.
function encode(method, url, body) {
  if (body === undefined || body === null) return { body: undefined, type: undefined };

  const positional = HAS_BODY.has(method)
    && CFG.form.some((p) => matches(p, url))
    && isForm(body);

  if (positional) {
    return { body: JSON.stringify(body.$positional), type: 'application/fud', positional: true };
  }
  const plain = isForm(body) ? body.$value : body;
  return { body: JSON.stringify(plain), type: 'application/json', positional: false };
}

function factory(method) {
  return (url, opts = {}) => {
    const call = async (body, callOpts = {}) => {
      const resolved = resolve(url, callOpts.params ?? opts.params);
      const enc = HAS_BODY.has(method)
        ? encode(method, resolved, body)
        : { body: undefined, type: undefined, positional: false };

      const req = {
        method,
        url: resolved,
        headers: {
          ...(enc.type ? { 'content-type': enc.type } : {}),
          ...(opts.headers ?? {}),
          ...(callOpts.headers ?? {}),
        },
        body: enc.body,
        positional: enc.positional,
        wire: null,          // bytes realmente transmitidos, si se comprime
        encoding: null,
        meta: {},
      };

      // El pipeline llega aquí con el JSON ya formado: es el punto donde se
      // conoce el tamaño exacto y se puede decidir con un número, no a ojo.
      if (req.body !== undefined && CFG.compress && canCompress()) {
        const { formato = 'gzip', minimo = FLOOR[formato] ?? 200 } = CFG.compress;
        const crudo = new TextEncoder().encode(req.body);
        if (crudo.length >= minimo) {
          const z = await compress(req.body, formato);
          if (z.length < crudo.length) {          // si no gana, se manda en claro
            req.wire = z;
            req.encoding = formato;
            req.headers['content-encoding'] = formato;
          }
        }
      }

      const mws = chain(method, resolved, opts.middlewares ?? []);
      const run = (i) => (r) =>
        i < mws.length ? mws[i](r, run(i + 1)) : CFG.transport(r);

      return run(0)(req);
    };

    call.method = method;
    call.url = url;
    return call;
  };
}

export const get = factory('GET');
export const post = factory('POST');
export const put = factory('PUT');
export const patch = factory('PATCH');
// `delete` es palabra reservada: no puede ser binding de un import.
export const del = factory('DELETE');

// ── transporte de evidencia ──────────────────────────────────────────────────
// Punto de inyección. No toca la red: registra la petición tal y como saldría y
// se la entrega al otro extremo en memoria. El formateo lo hace quien llama.
export const recordingTransport = (routes = {}) => {
  const t = async (req) => {
    t.last = req;
    const handler = routes[req.method];
    if (!handler) return { status: 204, body: null };

    // El otro extremo recibe los bytes, no el string: si vienen comprimidos,
    // los descomprime antes de parsear. Esto verifica el roundtrip real.
    const texto = req.wire ? await decompress(req.wire, req.encoding) : req.body;
    const parsed = texto === undefined ? undefined : JSON.parse(texto);
    return handler({ method: req.method, url: req.url, body: parsed, headers: req.headers, meta: {} });
  };
  t.last = null;
  return t;
};
