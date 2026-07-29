/**
 * Entry point of `@fudic/language-server` — the LSP server of SDD-24.
 *
 * The intelligence lives elsewhere: SDD-23 projects a `.fud` onto virtual TypeScript and
 * CSS, and the TypeScript, HTML and CSS services answer over that projection. What this
 * package owns is the assembly — which services run, how requests route through the
 * mapping, and when cached state dies.
 *
 * The public surface grows here as the phases land; today it carries the version only.
 */

export const VERSION = '0.0.1';
