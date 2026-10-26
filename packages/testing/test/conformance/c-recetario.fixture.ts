import type { $Props } from './c-recetario.fud';

export default {
  conformance: {
    t0: [
      { id: 1, titulo: 'Comprar', prioridad: 2, hecha: true, estado: 'hecha', creada: new Date('2026-03-01T00:00:00.000Z') },
      { id: 2, titulo: 'Barrer', prioridad: 1, hecha: false, estado: 'pendiente', creada: new Date('2026-01-15T00:00:00.000Z') },
      { id: 3, titulo: 'Cocinar', prioridad: 3, hecha: false, estado: 'pendiente', creada: new Date('2026-02-10T00:00:00.000Z') },
      { id: 4, titulo: 'Archivar', prioridad: 1, hecha: true, estado: 'hecha', creada: new Date('2026-01-01T00:00:00.000Z') },
    ],
    e0: ['casa', 'urgente'],
    l0: [
      { nombre: 'Café', precio: 1.2, cantidad: 3, pagada: false },
      { nombre: 'Agua', precio: 0.5, cantidad: 2, pagada: true },
      { nombre: 'Bollo', precio: 2, cantidad: 1, pagada: false },
    ],
    n0: [7, 9.5, 4, 8],
    a0: [{ nombre: 'Marta' }, { nombre: 'Ana' }, { nombre: 'Luis' }],
    sel: 3,
    fil: 'pendiente',
    ord: 'precio',
    txt: 'Hola, mundo',
  },
} satisfies Record<string, $Props>;
