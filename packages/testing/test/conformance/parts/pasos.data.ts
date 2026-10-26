// A module of data (SDD-61 §3.9): its `export default` is a literal of data with a named type.
export type Paso = { readonly n: number; readonly texto: string };

export default [
  { n: 1, texto: 'Leer' },
  { n: 2, texto: 'Escribir' },
] satisfies readonly Paso[];
