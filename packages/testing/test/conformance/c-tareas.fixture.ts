import type { $Props } from './c-tareas.fud';

export default {
  conformance: {
    inicial: [
      { id: 1, titulo: 'uno', hecha: true },
      { id: 2, titulo: 'dos', hecha: false },
      { id: 3, titulo: 'tres', hecha: true },
      { id: 4, titulo: 'cuatro', hecha: false },
      { id: 5, titulo: 'cinco', hecha: false },
    ],
    firmas: [{ nombre: 'Marta' }, { nombre: 'Ana' }, { nombre: 'Luis' }],
  },
} satisfies Record<string, $Props>;
