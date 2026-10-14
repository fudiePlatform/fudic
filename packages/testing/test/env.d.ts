/// <reference types="vite/client" />
// What a `.fud` is to `tsc` outside the editor: its module, untyped (Volar types it there).
declare module '*.fud' {
  export const tag: string;
  export const css: string;
  export function render(...args: unknown[]): unknown;
}
declare module '*.fud?client';
declare module '*.fud?server';
