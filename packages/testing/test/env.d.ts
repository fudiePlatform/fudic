/// <reference types="vite/client" />

// What a `.fud` is to `tsc` outside the editor: its module, untyped (Volar types it there).
declare module '*.fud' {
  export type $Props = Record<string, unknown>;
  export const tag: string;
  export const css: string;
  export const $file: string;
  export function render(...args: never[]): unknown;
}
declare module '*.fud?client';
declare module '*.fud?server';

// The generated modules a test of `test/app` imports by hand, as the plugin types them there:
// this `tsc` runs before the plugin writes `.fudic/api`.
declare module 'fudic:components/x-hello' {
  export const greet: import('@fudic/http').ServerFunction<{ readonly name: string }, string>;
}
declare module 'fudic:components/x-save' {
  export const save: import('@fudic/http').ServerFunction<void, string>;
}
declare module 'fudic:components/x-alias' {
  export const save: import('@fudic/http').ServerFunction<{ readonly alias: string }, string>;
}
declare module 'fudic:components/x-finder' {
  export const find: import('@fudic/http').ServerFunction<{ readonly q: string }, string>;
  export const lost: import('@fudic/http').ServerFunction<void, string>;
  export const item: import('@fudic/http').ServerFunction<{ readonly id: number }, string>;
}
declare module 'fudic:components/x-guarded' {
  export const whoami: import('@fudic/http').ServerFunction<void, string>;
}
declare module 'fudic:routes/tags/[tag]' {
  export const like: import('@fudic/http').ServerFunction<void, string>;
}
