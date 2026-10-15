/** Translations (SDD-58): what the view says, found the same way by the extraction and the emit. */
export type { Message, Phrase, AttributeMessage, ResultLiteral, TCall, ViewMessages, MessageSource, CallSource } from './messages.js';
export { collectMessages, collectCalls, holeName, isInline } from './messages.js';
export { extractMessages, extractScriptMessages, contextOf } from './extract.js';
