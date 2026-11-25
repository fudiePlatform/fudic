// Lets a .ts file import a .fud component: its tests and its fixtures.
declare module '*.fud' {
  export type $Props = any;
  export const tag: string;
  export const css: string;
  export function render(...args: never[]): unknown;
  export const $file: string;
}
