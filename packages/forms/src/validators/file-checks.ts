/**
 * What `maxSize` and `accept` share (SDD-81 §3.2): their verdicts on a file field, apart from
 * the validators because the implementations of `rules.fudapi` answer verdicts, not errors.
 *
 * Both judge every file of a `file[]` on its own, never the sum, and both let an empty field
 * through: `null` and `[]` are `required`'s business, as an empty text is for `minLength`.
 *
 * `accepted` reads the syntax of the HTML attribute — MIME types, `image/*` wildcards and `.pdf`
 * extensions, separated by commas — so the rule and the dialog of the system say the same thing.
 * A file passes when its `type` or the extension of its name matches one of them: what the
 * browser and the client say, not what the bytes are. Looking at the bytes is a rule of the
 * project's own.
 */

/** What a file field holds: one file, several, or nothing. */
export type Files = Blob | readonly Blob[] | null;

const each = (v: Files): readonly Blob[] => (v === null ? [] : Array.isArray(v) ? v : [v as Blob]);

/** Every file is no bigger than `n` bytes. */
export const withinSize = (v: Files, n: number): boolean => each(v).every((f) => f.size <= n);

/** One entry of an `accept` list matches the file. */
function matches(file: Blob, entry: string): boolean {
  if (entry.startsWith('.')) {
    // A `Blob` has no name, so no extension matches it: only its type can.
    const name = (file as Partial<File>).name ?? '';
    return name.toLowerCase().endsWith(entry);
  }
  const type = file.type.toLowerCase();
  return entry.endsWith('/*') ? type.startsWith(entry.slice(0, -1)) : type === entry;
}

/** Every file matches some entry of `types`, the syntax of the HTML `accept` attribute. */
export function accepted(v: Files, types: string): boolean {
  const entries = types
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '');
  return each(v).every((f) => entries.some((entry) => matches(f, entry)));
}
