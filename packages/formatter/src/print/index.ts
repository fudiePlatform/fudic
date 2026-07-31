/** The markup printer. Canonical re-export. */

export { leafOf, reindent, sliceOf, type PrintContext } from './context.js';
export { printChildren, printInner, printItems, printRoot } from './content.js';
export { printElement } from './element.js';
export { printNode } from './node.js';
export { printOpaque } from './opaque.js';
export { printStyleElement } from './style.js';
export { printAttribute, printOpenTag } from './tag.js';
export { printComments, printGapBefore, rescueComments } from './trivia.js';
export { printIf, printLoop, printSwitch, printWhile } from './control.js';
export { printCode, printInlineCode, printSection } from './code.js';
