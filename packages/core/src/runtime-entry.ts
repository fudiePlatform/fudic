/**
 * The shape of a piece the coordinator STARTS (SDD-45 §3.4).
 *
 * One name and one shape, for a reason that is about the generator and not about elegance:
 * a piece that invented its own signature would force the coordinator to know it specially,
 * and then `@fudic/http` could not publish pieces without someone editing the generator —
 * which is exactly what §3.3 exists to prevent.
 *
 * **Only startup pieces implement this.** A library piece — `signal`, `element`, a form
 * binder — is not started by anybody: it is imported by whoever needs it, and it keeps the
 * names it exports today. Asking it for a uniform entry would be inventing a ceremony for
 * an `import { signal }`.
 *
 * The return is `unknown` on purpose. The coordinator composes at BUILD time (§4.4) and
 * never inspects what a piece hands back; a narrower type here would be a promise this
 * interface has no way to keep across four packages, and a piece that has something to
 * return still returns it — to whoever imports its own named export.
 */
export interface RuntimeEntry<Options> {
  install(options: Options): unknown;
}
