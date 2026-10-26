/**
 * Las filas de los dos calendarios de `/delegacion`.
 *
 * Dos listas y no una, y eso es lo que se está midiendo: el handler recibe el objeto de la
 * fila y le suma una marca encima, así que si los dos calendarios compartieran la lista
 * compartirían también las marcas y no se sabría cuál contó qué.
 *
 * Son literales de datos, no una fábrica: el servidor las pinta en cualquier backend, que
 * las lee como datos sin ejecutar nada.
 */

export interface Day {
  readonly id: string;
  readonly n: number;
  /** Cuántas veces se pulsó ESTA fila. Vive dentro del objeto: por eso prueba la identidad. */
  picks: number;
}

/** Las siete filas de `app-calendar`, pintadas por el servidor antes de que exista un byte de JavaScript. */
export const daysA: Day[] = [
  { id: "a1", n: 1, picks: 0 },
  { id: "a2", n: 2, picks: 0 },
  { id: "a3", n: 3, picks: 0 },
  { id: "a4", n: 4, picks: 0 },
  { id: "a5", n: 5, picks: 0 },
  { id: "a6", n: 6, picks: 0 },
  { id: "a7", n: 7, picks: 0 },
];

/** Las de `app-calendar-plain`: las mismas filas, en otros objetos. */
export const daysB: Day[] = [
  { id: "b1", n: 1, picks: 0 },
  { id: "b2", n: 2, picks: 0 },
  { id: "b3", n: 3, picks: 0 },
  { id: "b4", n: 4, picks: 0 },
  { id: "b5", n: 5, picks: 0 },
  { id: "b6", n: 6, picks: 0 },
  { id: "b7", n: 7, picks: 0 },
];
