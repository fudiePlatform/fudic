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
