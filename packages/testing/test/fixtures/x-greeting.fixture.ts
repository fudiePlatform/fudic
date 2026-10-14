import type { $Props } from './x-greeting.fud';

// The props each criterion of an x-greeting .fudspec would mount it with (`props <name>`).
export default {
  formal: { name: 'Sra. Ruiz', tone: 'formal' },
  plain: { name: 'Ana' },
} satisfies Record<string, $Props>;
