// Un módulo cualquiera para que `vista-errores.fud` tenga un import que intentar escribir.
export let importado = 1;

export function ayuda(): number {
  return importado;
}

// A stand-in for `@fudic/core`'s `signal`, which this example cannot resolve: the cases only
// need something shaped like a signal to call `.set()` on from the view.
export interface Senal<T> {
  (): T;
  set(value: T): void;
}

export function signal<T>(initial: T): Senal<T> {
  let value = initial;
  const read = (() => value) as Senal<T>;
  read.set = (next) => {
    value = next;
  };
  return read;
}
