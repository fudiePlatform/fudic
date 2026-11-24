import type { Fixtures } from '@fudic/terms';
import type { $Props } from './ui-command.fud';

export default {
  base: { command: 'npx @fudic/cli new mi-app' },
} satisfies Fixtures<$Props>;
