/**
 * The JSON Schema of a `fudic.json` (SDD-83 §3.11): every key the reader knows, with what each one
 * takes, the codes of the catalogue as the keys of `diagnostics` and the web-features ids as what
 * `allow` names. The editor registers it, so the author is completed and warned while writing.
 *
 * All of it and not only what SDD-83 added: a partial schema marks every other key as unknown
 * (§8.1, decision 20). It describes; the reader still decides — a value the schema lets through and
 * the reader refuses is `FUD0725` as always.
 */

import { features, FIRST_YEAR, lastYear } from '@fudic/baseline/config';
import { liveCodes } from '@fudic/diagnostics';
import { ID_PATTERN, PREFIX_PATTERN, STYLE_NAME_PATTERN } from './constants.js';

type Schema = Readonly<Record<string, unknown>>;

/** A pattern as JSON Schema writes it: the source of the regular expression, without its flags. */
const pattern = (expression: RegExp): string => expression.source;

/** A map of named stylesheets: `"name": "path"`. */
const styleMap = (description: string): Schema => ({
  type: 'object',
  description,
  propertyNames: { pattern: pattern(STYLE_NAME_PATTERN) },
  additionalProperties: { type: 'string', description: 'The sheet, relative to the project root.' },
});

/** A folder of the project, relative to it and inside it. */
const folder = (description: string): Schema => ({ type: 'string', description });

/** A size: whole bytes, or text with a unit (`"50mb"`). */
const size = (description: string): Schema => ({
  description,
  anyOf: [{ type: 'integer', minimum: 0 }, { type: 'string', pattern: '^\\s*\\d+(\\.\\d+)?\\s*([kKmMgG][bB])?\\s*$' }],
});

const LEVELS = ['off', 'hint', 'info', 'warning', 'error'] as const;

/** The keys of `diagnostics`: every live code, with its title and severity, and `warnings`. */
function diagnosticsSchema(): Schema {
  const codes = Object.fromEntries(
    liveCodes().map((info) => [
      info.code,
      {
        description: `${info.title} (${info.severity} by default)`,
        // An error is never lowered (`FUD1521`): the only level it takes is its own.
        enum: info.severity === 'error' ? ['error'] : [...LEVELS],
      },
    ]),
  );
  return {
    type: 'object',
    description: 'How this project reports each code: off, or as another severity. An error is never lowered.',
    properties: {
      warnings: { description: 'Every code that is a warning by default, unless it has its own entry.', enum: [...LEVELS] },
      ...codes,
    },
    propertyNames: { pattern: '^(FUD\\d{4}|warnings)$' },
  };
}

/** `baseline`: a level, or the level with the features used knowingly above it. */
function baselineSchema(): Schema {
  const target = {
    description: `"widely" (the default), "newly", or a year from ${FIRST_YEAR} to ${lastYear()}.`,
    anyOf: [
      { enum: ['widely', 'newly'] },
      { type: 'integer', minimum: FIRST_YEAR, maximum: lastYear() },
    ],
  };
  const all = features();
  return {
    description: "The Baseline the browsers of this project's users reach. `widely` when absent.",
    anyOf: [
      target,
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          target,
          allow: {
            type: 'array',
            description: 'Web-features ids used knowingly above the level: nothing of theirs warns.',
            uniqueItems: true,
            items: { type: 'string', enum: all.map((f) => f.id), enumDescriptions: all.map((f) => f.name) },
          },
        },
      },
    ],
  };
}

/** The whole schema. */
export function projectConfigSchema(): Schema {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'fudic.json',
    description: 'What a fudic project declares about itself.',
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', pattern: pattern(ID_PATTERN), description: 'The identity of the project: lowercase, may contain hyphens.' },
      kind: { enum: ['app', 'lib'], description: 'An app, or a library other projects use. `app` when absent.' },
      prefix: { type: 'string', pattern: pattern(PREFIX_PATTERN), description: 'What new components are named with, before the hyphen.' },
      globalStyles: styleMap('The sheets every component of this project adopts, in order.'),
      styles: styleMap('The sheets a component may adopt in the `shadowrootadoptedstylesheets` of its root template.'),
      locales: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: { type: 'string' },
        description: 'The languages of the app, BCP 47; the first is the one the code is written in.',
      },
      site: { type: 'string', format: 'uri', description: 'The origin the app is published at, like `https://example.com`.' },
      server: folder('Where the implementations that run only on the server live. `src/server` when absent.'),
      browser: folder('Where the implementations that run in the browser live. `src/browser` when absent.'),
      pipes: folder('Where the pipes live. `src/pipes` when absent.'),
      api: folder("A library's `.fudapi` folder. `fudapi` when absent."),
      earlyHints: { type: 'boolean', description: "Whether each route's early hints are written and sent. `true` when absent." },
      css: { enum: ['inline', 'link'], description: "Where a page's CSS lives. `inline` when absent." },
      guide: {
        type: 'object',
        description: 'The style guide this project carries.',
        required: ['sheet'],
        additionalProperties: false,
        properties: {
          sheet: { type: 'string', description: "The guide's entry sheet, relative to the project root." },
          icon: { type: 'string', description: 'The favicon of every page whose chain holds this guide.' },
        },
      },
      serve: {
        type: 'object',
        description: 'How the app is served.',
        additionalProperties: false,
        properties: {
          trustProxy: { type: 'boolean', description: 'Whether the server trusts the proxy in front of it.' },
          uploads: {
            type: 'object',
            additionalProperties: false,
            properties: {
              maxFileSize: size('The largest file one upload takes.'),
              maxFiles: { type: 'integer', minimum: 0, description: 'The most files one request takes.' },
              maxArgs: size('The largest the arguments of one request may be.'),
            },
          },
        },
      },
      diagnostics: diagnosticsSchema(),
      baseline: baselineSchema(),
    },
  };
}
