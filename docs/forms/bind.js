// @fudic/forms/dom
//
// Lo que en un .fud emite el compilador a partir de la directiva `control:`.
// Aquí se escribe a mano sobre los mismos atributos, para que la evidencia use
// exactamente la forma final: <input control:="seo.description">.

// ── lectura del elemento → valor del control ─────────────────────────────────
// La coerción la dicta el elemento, no una opción del usuario.
export function read(el) {
  const type = (el.type || '').toLowerCase();
  if (type === 'checkbox') return el.checked;
  if (type === 'number' || type === 'range') return el.value === '' ? null : Number(el.value);
  if (type === 'select-multiple') return [...el.selectedOptions].map((o) => o.value);
  if (type === 'date') return el.value === '' ? null : el.value;
  return el.value;
}

// ── escritura del control → elemento ─────────────────────────────────────────
export function write(el, v) {
  const type = (el.type || '').toLowerCase();
  if (type === 'checkbox') { el.checked = !!v; return; }
  if (type === 'select-multiple') {
    const set = new Set(Array.isArray(v) ? v : []);
    for (const o of el.options) o.selected = set.has(o.value);
    return;
  }
  el.value = v === null || v === undefined ? '' : v;
}

// ── navegación por ruta: "seo.description" ───────────────────────────────────
export const node = (f, path) => path.split('.').reduce((n, k) => n?.[k], f);

// ── enlace ───────────────────────────────────────────────────────────────────
export function bind(f, root, { onChange } = {}) {
  const fields = [...root.querySelectorAll('*')]
    .filter((el) => el.hasAttribute('control:'))
    .map((el) => ({ el, path: el.getAttribute('control:'), ctrl: node(f, el.getAttribute('control:')) }));

  const missing = fields.filter((c) => !c.ctrl).map((c) => c.path);
  if (missing.length) throw new Error(`control: sin campo en el schema → ${missing.join(', ')}`);

  // control → DOM: valores iniciales (el caso Edit del form)
  for (const c of fields) write(c.el, c.ctrl.value);

  const notify = async (c, onBlur) => {
    c.ctrl.value = read(c.el);
    if (onBlur) c.el.dataset.touched = '1';
    await f.$validate();                 // solo los isomórficos: esto es el cliente
    paint();
    onChange?.(f, c.path);
  };

  for (const c of fields) {
    c.el.addEventListener('input', () => notify(c, false));
    c.el.addEventListener('change', () => notify(c, false));
    c.el.addEventListener('blur', () => notify(c, true));
  }

  // ── pintado de errors ─────────────────────────────────────────────────────
  const slot = (c) => {
    const id = `err-${c.path.replace(/\./g, '-')}`;
    let n = root.querySelector(`#${id}`);
    if (!n) {
      n = document.createElement('small');
      n.id = id;
      n.className = 'err';
      c.el.insertAdjacentElement('afterend', n);
    }
    return n;
  };

  const message = (e) => Object.entries(e).map(([k, v]) =>
    ({ required: 'obligatorio', minLength: `mínimo ${v} caracteres`,
       maxLength: `máximo ${v} caracteres`, taken: 'ya está ocupado',
       protocolo: 'debe empezar por https://',
       requiredIfPublished: 'obligatorio si el post está publicado' }[k] ?? `${k}: ${v}`)).join(', ');

  function paint() {
    for (const c of fields) {
      const err = c.ctrl.errors;
      const visible = err && c.el.dataset.touched;
      slot(c).textContent = visible ? message(err) : '';
      c.el.classList.toggle('invalid', !!visible);
    }
    const s = root.querySelector('[data-summary]');
    if (s) s.textContent = f.$summary ? Object.values(f.$summary).join(' · ') : '';
  }

  // Errores que vienen del servidor (422): se marcan como tocados para que se vean.
  function showErrors(errors) {
    for (const c of fields) {
      const err = errors?.[c.path];
      if (err) { c.ctrl.errors = err; c.el.dataset.touched = '1'; }
    }
    paint();
  }

  const touchAll = () => { for (const c of fields) c.el.dataset.touched = '1'; paint(); };

  return { fields, paint, touchAll, showErrors, sync: () => fields.forEach((c) => write(c.el, c.ctrl.value)) };
}
