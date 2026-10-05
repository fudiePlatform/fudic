/**
 * `import.meta.env` as Vite fills it in, and only the part `url.ts` reads. Declared here and
 * not cast at the read: Vite and Vitest rewrite the bare expression `import.meta.env.DEV`, and
 * a cast around `import.meta` is no longer that expression (see `dev()` in `url.ts`).
 *
 * Optional because a runtime without Vite has no `env` at all. A `.d.ts` is not emitted, so
 * this never reaches a consumer's `ImportMeta`.
 */
interface ImportMeta {
  readonly env?: { readonly DEV?: boolean };
}
