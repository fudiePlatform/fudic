/**
 * La «capa de datos» de la regla `alias-taken`: existe para que se vea que **no llega al
 * navegador**.
 *
 * El marcador `ALIAS_TABLE_MARKER` es lo que la prueba de presupuesto busca en el chunk de
 * cliente: si aparece, la implementación de la regla, que vive en `src/server`, viajó con él.
 */

export const ALIAS_TABLE_MARKER = 'alias-table-must-not-ship';

const TAKEN: readonly string[] = ['admin', 'root', 'fudic'];

export async function aliasTaken(alias: string): Promise<boolean> {
  return Promise.resolve(TAKEN.includes(alias.toLowerCase()) && ALIAS_TABLE_MARKER.length > 0);
}
