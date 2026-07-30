/**
 * BUG-02 §4.5: the nonce is applied when the response is SERVED, not when it is
 * rendered — so a persisted render can be handed out twice with two different nonces.
 * Doing that without buffering the document means substituting over the stream, and the
 * token can land across a chunk boundary.
 */

import { describe, it, expect } from 'vitest';
import { NONCE_TOKEN, applyNonce, applyNonceStream, cspFor, newNonce } from '../src/csp.js';
import { readAll } from './helpers.js';

/** A byte stream from arbitrary text pieces — the boundaries are the point. */
function streamOf(pieces: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller): void {
      for (const piece of pieces) {
        controller.enqueue(encoder.encode(piece));
      }
      controller.close();
    },
  });
}

describe('cspFor / applyNonce / newNonce', () => {
  it('fills every {nonce} of a policy template', () => {
    expect(cspFor("script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'", 'abc')).toBe(
      "script-src 'nonce-abc'; style-src 'nonce-abc'",
    );
  });

  it('replaces every occurrence of the token', () => {
    expect(applyNonce(`<a nonce="${NONCE_TOKEN}"><b nonce="${NONCE_TOKEN}">`, 'z')).toBe(
      '<a nonce="z"><b nonce="z">',
    );
  });

  it('is 128 bits of base64url, and never twice the same', () => {
    const nonce = newNonce();
    expect(nonce).toMatch(/^[\w-]{22}$/u);
    expect(nonce).not.toBe(newNonce());
  });
});

describe('applyNonceStream', () => {
  it('substitutes a token contained in a single chunk', async () => {
    const out = applyNonceStream(streamOf([`<p nonce="${NONCE_TOKEN}">hi</p>`]), 'abc');
    expect(await readAll(out)).toBe('<p nonce="abc">hi</p>');
  });

  it('substitutes a token split across chunks, wherever the cut falls', async () => {
    const document = `<head><script nonce="${NONCE_TOKEN}"></script></head>`;
    for (let cut = 1; cut < document.length; cut += 1) {
      const out = applyNonceStream(streamOf([document.slice(0, cut), document.slice(cut)]), 'abc');
      expect(await readAll(out)).toBe('<head><script nonce="abc"></script></head>');
    }
  });

  it('survives a token dribbled one character at a time', async () => {
    const out = applyNonceStream(streamOf([...`x${NONCE_TOKEN}y`]), 'abc');
    expect(await readAll(out)).toBe('xabcy');
  });

  it('passes an empty stream through without emitting anything', async () => {
    expect(await readAll(applyNonceStream(streamOf([]), 'abc'))).toBe('');
  });

  it('does not split a multi-byte character across the carry', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(`ñ${NONCE_TOKEN}ñ`);
    const source = new ReadableStream<Uint8Array>({
      start(controller): void {
        // Cut INSIDE the leading two-byte character.
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1));
        controller.close();
      },
    });
    expect(await readAll(applyNonceStream(source, 'abc'))).toBe('ñabcñ');
  });
});
