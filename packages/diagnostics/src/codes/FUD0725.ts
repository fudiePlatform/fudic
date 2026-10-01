import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** What is wrong with `fudic.json`: one per guilty field, each with its own wording. */
export type FUD0725Problem =
  /** The file exists and could not be read. */
  | { readonly problem: 'unreadable'; readonly reason: string }
  /** The text does not parse as JSON. */
  | { readonly problem: 'not-json'; readonly reason: string }
  /** The JSON is not an object. */
  | { readonly problem: 'not-object' }
  /** A string field (`id`, `prefix`) of the wrong type or shape. */
  | {
      readonly problem: 'string-field';
      readonly field: string;
      /** The source of the pattern it has to match. */
      readonly pattern: string;
      /** What the pattern means, in words. */
      readonly note: string;
    }
  /** `kind` is neither `app` nor `lib`. */
  | { readonly problem: 'kind' }
  /** `globalStyles`/`styles` written as an array: the shape `styles` used to have. */
  | { readonly problem: 'style-array'; readonly field: string }
  /** `globalStyles`/`styles` that is not an object. */
  | { readonly problem: 'style-not-object'; readonly field: string }
  /** One entry of `globalStyles`/`styles` with a bad name or a non-string path. */
  | {
      readonly problem: 'style-entry';
      readonly field: string;
      readonly name: string;
      /** The source of the pattern a sheet name has to match. */
      readonly pattern: string;
    }
  /** A CLI flag whose value would be written into `fudic.json` and fail its own reader. */
  | {
      readonly problem: 'flag';
      readonly field: string;
      readonly value: string;
      /** The source of the pattern the value has to match. */
      readonly pattern: string;
    };

/** Parameters of `FUD0725`. */
export type FUD0725Params = FileInput & FUD0725Problem;

function describe(p: FUD0725Problem): string {
  switch (p.problem) {
    case 'unreadable':
      return `fudic.json could not be read: ${p.reason}`;
    case 'not-json':
      return `fudic.json is not valid JSON: ${p.reason}`;
    case 'not-object':
      return 'fudic.json must be a JSON object';
    case 'string-field':
      return `fudic.json "${p.field}" must be a string matching ${p.pattern} (${p.note})`;
    case 'kind':
      return 'fudic.json "kind" must be "app" or "lib"';
    case 'style-array':
      return (
        `fudic.json "${p.field}" must be an object of "name": "path" — a sheet for every component goes in ` +
        '"globalStyles", one a component chooses goes in "styles"'
      );
    case 'style-not-object':
      return `fudic.json "${p.field}" must be an object of "name": "path"`;
    case 'style-entry':
      return (
        `fudic.json "${p.field}.${p.name}" must be a path, under a name matching ${p.pattern} ` +
        '(no hyphen: the hyphen is what makes a tag)'
      );
    case 'flag':
      return `--${p.field} "${p.value}" is not usable in fudic.json: it must match ${p.pattern}`;
  }
}

/** `fudic.json` is unreadable or has an invalid shape; was `FUD0720` (SDD-41). */
export const FUD0725 = (p: FUD0725Params): FileDiagnostic => file('FUD0725', 'error', describe(p), p);
