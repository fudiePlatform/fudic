/** What `routes/vista.fudapi` declares, implemented: fixed data for the view's catalog. */

import { load } from 'fudic:routes/vista';

// A 1×1 image as `data:image/…`: it passes in `<img src>` and nowhere else.
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

load.handle(() => ({
  articulos: [
    { titulo: 'Hola', resumen: 'El primero', autor: { nombre: 'Ana', web: 'https://ana.example' }, destacado: true },
    { titulo: 'Adiós', resumen: 'El segundo', autor: { nombre: 'Luis' }, coautor: { nombre: 'Marta' } },
  ],
  tareas: [
    { id: 1, titulo: 'Escribir', prioridad: 2, hecha: true, estado: 'cerrada', creada: new Date(Date.UTC(2026, 9, 3)) },
    { id: 2, titulo: 'Revisar', prioridad: 1, hecha: false, estado: 'abierta', creada: new Date(Date.UTC(2026, 9, 1)) },
    { id: 3, titulo: 'Publicar', prioridad: 3, hecha: false, estado: 'abierta', creada: new Date(Date.UTC(2026, 9, 5)) },
    { id: 4, titulo: 'Anunciar', prioridad: 1, hecha: true, estado: 'cerrada', creada: new Date(Date.UTC(2026, 9, 2)) },
    { id: 5, titulo: 'Medir', prioridad: 2, hecha: false, estado: 'abierta', creada: new Date(Date.UTC(2026, 9, 4)) },
  ],
  lineas: [
    { nombre: 'Café', precio: 1.5, cantidad: 2, pagada: true },
    { nombre: 'Tostada', precio: 2.25, cantidad: 1, pagada: false },
    { nombre: 'Zumo', precio: 3, cantidad: 2, pagada: false },
  ],
  notas: [7, 9.5, 4, 8],
  etiquetas: ['nuevo', 'urgente'],
  autores: [{ nombre: 'Ana' }, { nombre: 'Luis' }, { nombre: 'Marta' }],
  vacia: [],
  stock: { s: 3, m: 0, l: 7 },
  tono: 'aviso',
  tarjeta: { title: 'Una tarjeta esparcida', href: '/blog', variante: 'normal' },
  campo: { etiqueta: 'Nombre', placeholder: 'Ana', maxlength: 20, required: true },
  enlace: { href: '/blog', title: 'Del enlace' },
  extra: { title: 'Del extra' },
  // The ones the guard has to leave inert: `about:blank`.
  peligrosas: [
    { clave: 'javascript:', url: "javascript:alert('xss')" },
    { clave: 'mayúsculas', url: "JaVaScRiPt:alert('xss')" },
    { clave: 'espacios delante', url: "   javascript:alert('xss')" },
    { clave: 'tabulador dentro', url: "java\tscript:alert('xss')" },
    { clave: 'salto de línea dentro', url: "java\nscript:alert('xss')" },
    { clave: 'retorno de carro dentro', url: "java\rscript:alert('xss')" },
    { clave: 'carácter de control delante', url: "\x01javascript:alert('xss')" },
    { clave: 'vbscript:', url: 'vbscript:msgbox(1)' },
    { clave: 'data:text/html', url: "data:text/html,<script>alert('xss')</script>" },
    { clave: 'data:image en <a href>', url: png },
    { clave: 'file:', url: 'file:///etc/passwd' },
    { clave: 'blob:', url: 'blob:https://example.com/uuid' },
    { clave: 'esquema propio sin marcar', url: 'miapp:abrir' },
  ],
  // The ones the guard has to leave untouched.
  seguras: [
    { clave: 'https:', url: 'https://example.com/ruta?q=1' },
    { clave: 'http:', url: 'http://example.com/' },
    { clave: 'mailto:', url: 'mailto:ana@example.com' },
    { clave: 'tel:', url: 'tel:+34600000000' },
    { clave: 'absoluta', url: '/blog' },
    { clave: 'relativa', url: 'blog/primer-post' },
    { clave: 'query', url: '?pagina=2' },
    { clave: 'ancla', url: '#urls' },
    { clave: 'dos puntos tras la barra', url: '/a:b' },
    { clave: 'entidad sin decodificar', url: "javascript&colon;alert('xss')" },
  ],
}));
