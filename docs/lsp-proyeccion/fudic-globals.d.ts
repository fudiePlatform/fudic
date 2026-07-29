// Ambientes que la CLI de scaffolding emite en el proyecto del usuario.
declare function props<T>(): T;

type $Scalar = string | number | boolean | bigint | null | undefined;

declare function $text(v: $Scalar): void;
declare function $attr(v: $Scalar): void;
declare function $attrs<T>(a: T): void;
declare function $on<K extends keyof HTMLElementEventMap>(
  type: K, h: (ev: HTMLElementEventMap[K]) => unknown): void;
declare function $section<T extends string>(name: T): void;
declare function $cls(v: boolean): void;
declare function $sty(v: string): void;
declare function $slot(): void;
declare function $ref<E extends Element>(): E;
