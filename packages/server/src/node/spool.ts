/**
 * Where an upload waits on Node (SDD-81 §3.5): each file in a temporary file of `os.tmpdir()`,
 * written as its bytes arrive, and handed to the handler as `fs.openAsBlob`, a `File` that reads
 * from the disk and is never held in memory. `release` removes them all, whatever the response
 * came to.
 */

import { createWriteStream, openAsBlob } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Spool } from '@fudic/http/server';

export function diskSpool(): Spool {
  let dir: Promise<string> | undefined;
  let count = 0;
  return {
    async put(bytes, meta) {
      dir ??= mkdtemp(join(tmpdir(), 'fudic-upload-'));
      const file = join(await dir, String(count++));
      await pipeline(Readable.fromWeb(bytes as import('node:stream/web').ReadableStream<Uint8Array>), createWriteStream(file));
      const blob = await openAsBlob(file, { type: meta.type });
      return new File([blob], meta.name, { type: meta.type });
    },
    async release() {
      if (dir === undefined) return;
      await rm(await dir, { recursive: true, force: true });
    },
  };
}
