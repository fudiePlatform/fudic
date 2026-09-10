/**
 * Las filas de los dos calendarios de `/delegacion`.
 *
 * Una FÁBRICA y no una constante, y eso es lo que se está midiendo: el handler recibe el
 * objeto de la fila y le suma una marca encima, así que si los dos calendarios compartieran
 * la lista compartirían también las marcas y no se sabría cuál contó qué.
 */

export interface Day {
  readonly id: string;
  readonly n: number;
  /** Cuántas veces se pulsó ESTA fila. Vive dentro del objeto: por eso prueba la identidad. */
  picks: number;
}

/** Siete filas, pintadas por el servidor antes de que exista un byte de JavaScript. */
export function makeDays(prefix: string): Day[] {
  return [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `${prefix}${n}`, n, picks: 0 }));
}
