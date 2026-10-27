/**
 * A module of data: its `export default` is a literal of data with a named type, so the server
 * of any backend loads it as data, without running anything. `/vista` paints it.
 */

export interface Paso {
  readonly n: number;
  readonly texto: string;
}

export default [
  { n: 1, texto: 'Leer la lista blanca' },
  { n: 2, texto: 'Escribir la vista con ella' },
] satisfies readonly Paso[];
