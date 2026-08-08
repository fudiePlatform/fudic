/**
 * The table of shapes an event / bus binding value can take (SDD-15 §4.5, §6.20).
 *
 * The distinction is made on the ROOT node Oxc gives back, never on the text, and that is
 * what this suite pins: the same characters mean different things depending on what they
 * parse to, and a value that parses to none of the four is a diagnostic rather than a
 * chunk that fails at runtime.
 */
import { describe, expect, it } from 'vitest';
import { extractCode } from '../../src/emit/oxc-code.js';
import { busHandler, eventHandler, hookupContext } from '../../src/emit/events.js';
import { classifyAttribute } from '../../src/binding/index.js';
import type { ComponentDocument } from '../../src/document/index.js';
import type { ElementNode } from '../../src/html/index.js';
import { parse } from './_support.js';

/** One `<button @click="…">` in a component, taken apart the way the emit does. */
function handlers(value: string): {
  event: string | undefined;
  bus: string | undefined;
  diagnostics: number;
} {
  const source =
    `<m-el>\n  <template shadowrootmode="open">` +
    `<button @click="${value}"></button></template>\n</m-el>\n`;
  const doc = parse(source) as ComponentDocument;
  const { template, diagnostics } = extractCode(source, doc);
  const button = doc.template!.children.find((c): c is ElementNode => c.type === 'element')!;
  const binding = classifyAttribute(button.attributes[0]!, source).value;
  if (binding.type !== 'event') throw new Error('expected an event binding');
  const ctx = hookupContext(template, []);
  return {
    event: eventHandler(source, binding.value.expr, ctx),
    bus: busHandler(source, binding.value.expr, ctx),
    diagnostics: diagnostics.length,
  };
}

describe('event bindings — the four shapes (§4.5, §6.20)', () => {
  it('a bare reference IS the listener: one frame, no wrapper', () => {
    expect(handlers('@toggle').event).toBe('toggle');
  });

  it('a call is invoked AT DISPATCH, inside an arrow whose parameter is $event', () => {
    // The argument list is copied character for character: no reordering, and `$event`
    // needs no substitution because the parameter is spelled exactly that.
    expect(handlers('@del($event, item.id)').event).toBe('($event) => del($event, item.id)');
    expect(handlers('@del(item.id, $event)').event).toBe('($event) => del(item.id, $event)');
    expect(handlers('@del()').event).toBe('($event) => del()');
    expect(handlers('@del(item.id)').event).toBe('($event) => del(item.id)');
  });

  it('an explicit lambda is the listener, parentheses of the author included', () => {
    expect(handlers('@(e => del(e))').event).toBe('e => del(e)');
    expect(handlers('@((e) => del(e))').event).toBe('(e) => del(e)');
    expect(handlers('@(function (e) { del(e); })').event).toBe('function (e) { del(e); }');
    // Parens the author wrote AROUND the whole thing survive `@( … )` and, with
    // `preserveParens` on, arrive as a node of their own. Refusing the handler over them
    // would be FUD0291 on perfectly good JS.
    expect(handlers('@((e => del(e)))').event).toBe('(e => del(e))');
  });

  it('anything else is not subscribable', () => {
    expect(handlers('@(1 + 2)').event).toBeUndefined();
    expect(handlers('@item.id').event).toBeUndefined(); // a member expression is a value
  });

  it('a value the batch never parsed is not subscribable either', () => {
    // A syntax error inside the expression leaves the fragment with no AST at all. There
    // is nothing to decide the shape from, so the binding is dropped — with its own
    // diagnostic beside the parser's.
    const broken = handlers('@(a ,, b)');
    expect(broken.diagnostics).toBeGreaterThan(0);
    expect(broken.event).toBeUndefined();
    expect(broken.bus).toBeUndefined();
  });
});

describe('bus bindings — the same shapes, called with the host as context (§4.4)', () => {
  it('takes a call apart so the AUTHOR’s function gets the host', () => {
    // Wrapping it in an arrow would bind nothing: an arrow ignores the `this` of `.call`.
    expect(handlers('@onCarrito($event)').bus).toBe(
      '($event) => onCarrito.call($host, $event)',
    );
    expect(handlers('@onCarrito($event, item.id)').bus).toBe(
      '($event) => onCarrito.call($host, $event, item.id)',
    );
    expect(handlers('@onCarrito()').bus).toBe('($event) => onCarrito.call($host)');
  });

  it('calls a bare reference, and parenthesizes a lambda so `.call` binds to it', () => {
    expect(handlers('@onCarrito').bus).toBe('($event) => onCarrito.call($host, $event)');
    expect(handlers('@(function (e) { seen(this, e); })').bus).toBe(
      '($event) => (function (e) { seen(this, e); }).call($host, $event)',
    );
  });

  it('refuses what an event binding refuses', () => {
    expect(handlers('@(1 + 2)').bus).toBeUndefined();
  });
});
