/** The props of `_layout-marco.fud`, for the two routes that use it. */

import { layout } from 'fudic:routes/marco';
import { layout as layoutSinLateral } from 'fudic:routes/marco-sin-lateral';

layout.handle(() => ({
  titulo: 'Un layout con marco',
  seccion: 'Marco',
  inicio: 5,
  migas: ['Inicio', 'Ejemplos'],
}));

layoutSinLateral.handle(() => ({ titulo: 'El mismo marco, otra ruta' }));
