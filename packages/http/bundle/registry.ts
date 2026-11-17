/**
 * Entry of the `http/registry` piece: the forms registry `@fudic/http/contract` re-exports, by the
 * URL of the piece that owns it. The browser root asks for it, and must not download the client
 * of the functions to get it.
 */
export { folderOf, inTurn, loadingFile, resetRegistry, setFolders, takeRefusal } from '@fudic/forms/contract';
