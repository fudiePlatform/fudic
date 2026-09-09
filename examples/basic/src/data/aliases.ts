/**
 * La «capa de datos» del validador de servidor: existe para que se vea que **no llega al
 * navegador**.
 *
 * El marcador `ALIAS_TABLE_MARKER` es lo que la prueba de presupuesto busca en el chunk de
 * cliente: si aparece, el cuerpo del `serverValidator` viajó, y con él este módulo.
 */

export const ALIAS_TABLE_MARKER = 'alias-table-must-not-ship';

const TAKEN: readonly string[] = ['admin', 'root', 'fudic'];

export async function aliasTaken(alias: string): Promise<boolean> {
  return Promise.resolve(TAKEN.includes(alias.toLowerCase()) && ALIAS_TABLE_MARKER.length > 0);
}
