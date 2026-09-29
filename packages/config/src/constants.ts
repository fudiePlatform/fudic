/** The file's name. The one place it is spelled. */
export const CONFIG_FILE = 'fudic.json';

/** What `id` must look like: lowercase, may carry hyphens. */
export const ID_PATTERN = /^[a-z][a-z0-9-]*$/u;

/**
 * What `prefix` must look like. No hyphen on purpose — the hyphen is put by `tagOf`, and
 * that one function being the only one that puts it is what makes `app--card` impossible.
 */
export const PREFIX_PATTERN = /^[a-z][a-z0-9]*$/u;

/**
 * What the NAME of a stylesheet must look like: it is the module-map specifier the sheet is
 * adopted under, written as is in the HTML. No hyphen, because a custom element name always
 * has one — so a sheet can never be told apart from a component's own sheet only by luck.
 */
export const STYLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/u;
