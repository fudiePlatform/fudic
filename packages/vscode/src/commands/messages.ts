/**
 * What the commands say when they cannot do the thing (SDD-25 §4.3).
 *
 * Gathered in one file because every one of them is the same decision: a command invoked in
 * a state where it makes no sense must say so, not fail silently. A palette command that
 * appears to do nothing is indistinguishable from a broken extension.
 */

export const NO_ACTIVE_FUD = 'Fudic: este comando necesita un fichero .fud activo.';

export const SERVER_DOWN =
  'Fudic: el servidor de lenguaje no está en marcha. Ejecuta «Fudic: Reiniciar el servidor de lenguaje».';

export const RESTART_FAILED =
  'Fudic: el servidor de lenguaje no arrancó. Mira el registro de Fudic para ver por qué.';

export const NO_VIRTUAL_FILES =
  'Fudic: el servidor no devolvió ficheros virtuales para este documento.';

export const FORMAT_DISABLED =
  'Fudic: el formateo está desactivado por el ajuste «fudic.format.enable».';

/** The reply when a request dies with the server that was answering it. */
export const requestFailed = (method: string, error: unknown): string =>
  `Fudic: la petición ${method} falló: ${String(error)}`;
