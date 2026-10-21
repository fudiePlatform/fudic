/** The extension of a contract file, sibling of the route or component whose server it declares. */
export const API_EXTENSION = '.fudapi';

export type * from './ast.js';
export { parseApi, DECLARATION_KEYWORDS } from './parse.js';
export { formatApi } from './format.js';
