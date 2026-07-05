/**
 * XML namespaces resolved in one place (SDD-14 §3.1). An element's namespace
 * (HTML / SVG / MathML) is decided HERE, once, when it is created — never
 * re-derived downstream.
 */

export const NS = {
  html: 'http://www.w3.org/1999/xhtml',
  svg: 'http://www.w3.org/2000/svg',
  math: 'http://www.w3.org/1998/Math/MathML',
} as const;

/** The three namespaces fudic emits. Default is `html`. */
export type Ns = keyof typeof NS;
