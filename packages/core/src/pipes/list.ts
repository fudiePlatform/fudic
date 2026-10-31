import { preset, type Pipe } from '../pipe.js';

export function list(options: Intl.ListFormatOptions = {}): Pipe<readonly string[]> {
  return preset<readonly string[]>('list', options, (locale, opts) => {
    const f = new Intl.ListFormat(locale, opts);
    return (value) => f.format(value);
  });
}
