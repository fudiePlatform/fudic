import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@{ }` block in the `<body>` of a layout (SDD-40). */
export const FUD0705 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0705',
    'error',
    'the <body> of a layout writes no `@{ }`: a layout declares its props and no logic of its own — what the block would compute belongs to a component or to the route',
    p,
  );
