/** The file's name. The one place it is spelled. */
export const CONFIG_FILE = 'fudic.json';

/** What `id` must look like: lowercase, may carry hyphens. */
export const ID_PATTERN = /^[a-z][a-z0-9-]*$/u;

/**
 * What `prefix` must look like. No hyphen on purpose — the hyphen is put by `tagOf`, and
 * that one function being the only one that puts it is what makes `app--card` impossible.
 */
export const PREFIX_PATTERN = /^[a-z][a-z0-9]*$/u;
