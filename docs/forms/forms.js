// @fudic/forms
// Runtime puro. Corre igual en navegador y en Node. Sin dependencias.

const CONTROL = Symbol('fud.control');
const GROUP = Symbol('fud.group');

// `null` es el vacío canónico. Un control nunca vale `undefined`: en la forma con
// claves JSON.stringify borra la clave entera, y en la posicional lo convierte en
// null igualmente. Se normaliza aquí para que las dos formas y el roundtrip
// coincidan, en vez de depender de un efecto colateral de JSON.
export const control = (def = null, validators = []) =>
  ({ $kind: CONTROL, def: def === undefined ? null : def, validators });
export const group = (schema, validators = []) => ({ $kind: GROUP, schema, validators });

// ── validators ───────────────────────────────────────────────────────────────
// validator(fn)        → isomórfico: viaja al bundle cliente y corre también en servidor.
// validator.server(fn) → solo servidor. MemberExpression en posición fija del AST,
//                        que es lo que permite al bundler borrarlo del bundle cliente.
//                        Aquí, sin bundler, se marca y se salta según el lado.
export function validator(fn) {
  const v = (...a) => fn(...a);
  v.$server = false;
  return v;
}
validator.server = (fn) => {
  const v = (...a) => fn(...a);
  v.$server = true;
  return v;
};

export const required = validator((v) =>
  v === '' || v === null || v === undefined ? { required: true } : null);

export const minLength = (n) => validator((v) =>
  String(v).length < n ? { minLength: n } : null);

export const maxLength = (n) => validator((v) =>
  String(v).length > n ? { maxLength: n } : null);

// ── form ─────────────────────────────────────────────────────────────────────

// Claves del schema en orden de declaración. El namespace `$` es de la API, no campos.
const fields = (schema) => Object.keys(schema).filter((k) => !k.startsWith('$'));

// Frontera de serialización: `undefined` nunca sale ni entra, a ninguna profundidad.
//
// JSON.stringify no es homogéneo con undefined: en un array lo convierte en null
// (conserva la posición), pero en un objeto BORRA la clave. Un control cuyo valor
// sea un objeto con propiedades en undefined perdería esas propiedades por el
// camino, y el $value del servidor no sería el del cliente. Lo mismo con funciones
// y símbolos. Se normaliza aquí, no se delega en el efecto colateral de JSON.
//
// No muta lo que recibe: devuelve estructura nueva. Lo que no es objeto plano ni
// array (Date, y cualquier cosa con toJSON) pasa tal cual: tiene su propia
// serialización y no es asunto de esta frontera.
const isPlainObject = (v) => {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

const normalize = (v, seen) => {
  if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return null;
  if (v === null || typeof v !== 'object') return v;
  if (!Array.isArray(v) && !isPlainObject(v)) return v;

  seen ??= new WeakSet();
  if (seen.has(v)) throw new TypeError('referencia circular en el valor de un control');
  seen.add(v);

  const out = Array.isArray(v)
    ? v.map((x) => normalize(x, seen))
    : Object.fromEntries(Object.keys(v).map((k) => [k, normalize(v[k], seen)]));

  seen.delete(v);   // hermanos que comparten referencia no son ciclo
  return out;
};

const toNull = (v) => normalize(v);

export function form(schema, options = {}) {
  const nodes = {};

  for (const k of fields(schema)) {
    const n = schema[k];
    nodes[k] = n.$kind === GROUP
      ? form(n.schema, {})
      : { value: n.def, errors: null, get $errors() { return this.errors; } };
  }

  const api = {
    ...nodes,

    // ── forma con claves ──────────────────────────────────────────────────
    get $value() {
      const o = {};
      for (const k of fields(schema)) {
        o[k] = schema[k].$kind === GROUP ? nodes[k].$value : toNull(nodes[k].value);
      }
      return o;
    },

    set $value(v) {
      if (Array.isArray(v)) { api.$positional = v; return; }
      for (const k of fields(schema)) {
        if (schema[k].$kind === GROUP) nodes[k].$value = v[k] ?? {};
        else nodes[k].value = toNull(v[k]);
      }
    },

    // ── forma posicional ──────────────────────────────────────────────────
    // Object.values de primer nivel, en orden de declaración del schema.
    get $positional() {
      return fields(schema).map((k) =>
        schema[k].$kind === GROUP ? nodes[k].$positional : toNull(nodes[k].value));
    },

    // Simétrico exacto: el mismo recorrido, por índice.
    set $positional(arr) {
      if (!Array.isArray(arr)) throw new TypeError('$positional espera un array');
      const ks = fields(schema);
      if (arr.length !== ks.length) {
        throw new RangeError(`aridad: esperados ${ks.length}, recibidos ${arr.length}`);
      }
      ks.forEach((k, i) => {
        if (schema[k].$kind === GROUP) nodes[k].$positional = arr[i];
        else nodes[k].value = toNull(arr[i]);
      });
    },

    // ── validación ────────────────────────────────────────────────────────
    // { server: true } añade los validator.server. El posicional no interviene.
    async $validate({ server = false } = {}) {
      const errors = {};

      const walk = async (sc, nd, prefix) => {
        for (const k of fields(sc)) {
          const n = sc[k];
          const path = prefix ? `${prefix}.${k}` : k;
          if (n.$kind === GROUP) { await walk(n.schema, nd[k], path); continue; }

          let err = null;
          for (const v of n.validators) {
            if (v.$server && !server) continue;
            err = await v(nd[k].value, api);
            if (err) break;
          }
          const contextual = options.validate?.[path];
          if (!err && contextual) err = await contextual(nd[k].value, api);
          const srv = options.serverValidate?.[path];
          if (!err && srv && server) err = await srv(nd[k].value, api);

          nd[k].errors = err;
          if (err) errors[path] = err;
        }
      };

      await walk(schema, nodes, '');

      const summary = options.summary ? await options.summary(api) : null;
      api.$errors = Object.keys(errors).length ? errors : null;
      api.$summary = summary;
      return !api.$errors && !summary;
    },

    $errors: null,
    $summary: null,
    $schema: schema,
    $fields: () => fields(schema),
  };

  return api;
}

// ── @fudic/forms/middleware ──────────────────────────────────────────────────
// Lado servidor. No distingue codificación: el setter de $value acepta ambas.
export const validate = (factory) => async (ctx, next) => {
  const f = factory();
  f.$value = ctx.body;
  const ok = await f.$validate({ server: true });
  if (!ok) {
    return {
      status: 422,
      headers: { 'content-type': 'application/problem+json' },
      body: { title: 'Validación', errors: f.$errors, summary: f.$summary },
    };
  }
  ctx.form = f;
  return next(ctx);
};
