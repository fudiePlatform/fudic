// VS Code's own TypeScript server does not know what a `.fud` is, so a `.fixture.ts` that
// imports a component's props type, or a `.test.ts` that imports the component, would show the
// import in red (SDD-52 §8). The fudic toolchain resolves the real `.fud` and wins over this
// fallback; the editor's server only gets the fallback, with `$Props` as `any`. `$file` exists
// only under `fudicTest()`, where `mount` reads it.
declare module '*.fud' {
  export type $Props = any;
  export const tag: string;
  export const css: string;
  export function render(...args: never[]): unknown;
  export const $file: string;
}
