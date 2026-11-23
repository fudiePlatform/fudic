import type { Fixtures } from '@fudic/terms';
import type { $Props } from './tienda-button.fud';

// Los props con los que cada criterio de tienda-button.fudspec monta el botón (`props <nombre>`).
export default {
  base: { $content: 'Añadir al carrito' },
  secundaria: { variant: 'secondary', $content: 'Seguir comprando' },
  peligro: { variant: 'danger', $content: 'Vaciar el carrito' },
  deshabilitada: { disabled: true, $content: 'Sin stock' },
  ocupada: { busy: true, $content: 'Añadir al carrito' },
  'texto-largo': { $content: 'Añadir al carrito y seguir con la compra' },
} satisfies Fixtures<$Props>;
