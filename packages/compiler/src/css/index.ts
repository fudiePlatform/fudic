/**
 * CSS with Razor inside `<style>` (SDD-09). Canonical re-export.
 */

export type { CssPart, CssText, StyleNode } from './nodes.js';
export { CSS_AT_RULES, isCssAtRule, atRuleNameEnd } from './atrules.js';
export { parseStyle } from './css.js';
