import { expect, it, vi } from 'vitest';

const cli = vi.hoisted(() => ({ main: vi.fn(async () => undefined), processIo: vi.fn(() => ({ marker: 'io' })) }));
vi.mock('../src/cli.js', () => cli);

it('hands main the arguments after the script and the real process', async () => {
  const argv = process.argv;
  process.argv = ['node', 'fudic-workbench', 'app-card.fud', '--keep'];
  try {
    await import('../src/bin.js');
  } finally {
    process.argv = argv;
  }
  expect(cli.main).toHaveBeenCalledWith(['app-card.fud', '--keep'], { marker: 'io' });
});
