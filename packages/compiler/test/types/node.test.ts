import { describe, it, expect } from 'vitest';
import type { Node, HydratableNode } from '../../src/types/node.js';
import { span } from '../../src/types/span.js';

// Node and HydratableNode are pure type contracts (no runtime). These tests pin
// the shape so a regression in the interfaces fails to compile.

describe('Node contract', () => {
  it('requires type and span', () => {
    const node: Node = { type: 'placeholder', span: span(0, 3) };
    expect(node.span).toEqual({ start: 0, end: 3 });
  });

  it('HydratableNode reserves optional hydration keys', () => {
    const node: HydratableNode = { type: 'placeholder', span: span(0, 3) };
    // key/instanceParentKey are omitted, not undefined (exactOptionalPropertyTypes).
    expect('key' in node).toBe(false);
  });
});
