# FUD diagnostic code inventory (SDD-50 input)

Snapshot of worktree `sdd-50-diagnosticos` (HEAD 16b2c5d + in-progress edits; the new
`packages/diagnostics` package is EXCLUDED — it only holds infra, no emissions). Scope:
`packages/*/src/**/*.ts`. Comment/JSDoc mentions are ignored. Line numbers point at the line
where the code token (literal or constant) appears in the construction. All paths are relative
to `packages/`.

Severity helpers: `errorDiag`/`relatedError` = error, `warningDiag` = warning, `infoDiag` = info.
Class-private `#error(...)` helpers in balancer, lexer, html/parser, control, code, layout,
snippet/parser all wrap `errorDiag`. `CliError` (cli) has no severity: always fatal = error.
Vite `FudicDiagnostic` / `ConfigDiagnostic` have no severity: the plugin decides with
`this.warn` / `this.error` (recorded below per code).

Shapes: **source** = compiler-style `Diagnostic` with a span into a `.fud` (or a `.css` sheet for
FUD085x); **file** = about a file, span optional/absent (`FudicDiagnostic`, `ConfigDiagnostic`,
`CliError` with `file`); **project** = no file at all (CliError without file, plugin string
about the build/project). "plugin-string" = never an object, emitted only as a
`this.warn/this.error(`[${CODE}] …`)` string in `vite/src/plugin.ts`.

---

## 1. Summary

- **Distinct code numbers constructed: 213** (rows of §2; 211 actually reach a user — FUD0365
  and FUD0390 are built and dropped). Distinct `'FUDnnnn'` string literals in `src` = 216 =
  213 + the 3 never-emitted constants below. Rows with a site in each package (codes shared
  across packages counted in each): compiler 161, vite 37, cli 21, config 4, formatter 3,
  language-server 3 (0460, 0461, 0744). With the 8 collisions split by meaning, there are
  **221 distinct (number, meaning) pairs** to give a file each.
- **Constants declared but never emitted: 3** — `FUD0395` (vite), `FUD0723` (config),
  `FUD0762` (vite, superseded by FUD0800). Plus **constructed but discarded** (built into a
  result the plugin never reports): `FUD0365` (options.ts), `FUD0390` (swconfig.ts, all 3
  sites), and the `swconfig.ts:122` site of `FUD0392`.
- **Retired / burned / reserved-unused** (no emission): 0050 (reserved), 0090, 0112, 0113,
  0130 (de facto), 0292 (reserved), 0293, 0422, 0437, 0603, 0604, 0703, 0704, 0706, 0722,
  0786, 0833 — plus 0762 superseded and 0197–0199 retired on paper by SDD-35 but STILL EMITTED.

### Collisions (same number, different meaning)

| Code | Meaning A | Meaning B |
|---|---|---|
| FUD0440 | compiler `layout/contract.ts`: route lacks a `required: true` section (SDD-48) | cli `FUD_TAG_INVALID`: invalid custom element name (SDD-22) |
| FUD0441 | compiler `layout/contract.ts`: text at root of a slotted hole (SDD-48) | cli `FUD_TAG_EXISTS`: tag already exists in project |
| FUD0442 | compiler `layout/contract.ts`: root of slotted hole writes own `slot=` (SDD-48) | cli `FUD_TAG_RESERVED`: tag reserved by HTML/SVG/MathML |
| FUD0443 | compiler `layout-body.ts`: layout hole inside @if/@switch/loop (SDD-48) | cli `FUD_TARGET_EXISTS`: target file/dir exists, no `--force` |
| FUD0444 | compiler `snippet/parser.ts`: `@render` arg reading scope without `@` (SDD-48) | cli `FUD_WIRE_TARGET_MISSING`: `--in` file does not exist |
| FUD0445 | compiler `snippet/parser.ts`: `@` arg followed by more than a path (SDD-48) | cli `FUD_WIRE_TARGET_BROKEN`: `--in` file does not parse |
| FUD0720 | compiler `host-bindings.ts`: `class:` on the component's own host tag (BUG-32) | config `FUD_CONFIG_MALFORMED`: `fudic.json` unreadable/invalid (SDD-41) |
| FUD0721 | compiler `emit/registry.ts`: `<link rel="component">` never used (BUG-32, warning) | config `FUD_CONFIG_ID_REQUIRED`: `sw.json` present and no `id` (SDD-41, emitted by vite) |

Range-level clash (no double emission today, but docs disagree): SDD-21/SDD-48 mark
`FUD0446`–`FUD0449` as "Reservados", while the CLI (SDD-22) emits 0446–0449. SDD-12 §5 says
`FUD0722`–`0739` are free, while SDD-41 owns `FUD0720`–`0739` (0723/0724 used by config/cli).
Consequence for code-keyed lookups: `REPAIRS` in the language server keys `FUD0440` and
`FUD0444` meaning the COMPILER codes; `BROKEN_SOURCE` in the CLI keys `FUD0445` meaning the CLI
code.

Same number, same meaning, in several places (NOT collisions, but must become ONE definition):
FUD0071, FUD0072 (control/layout/snippet parsers), FUD0291 (semantic + emit), FUD0423
(structure + resolve), FUD0761 (compiler + cli, intentional), FUD0823 (structure + body-rules),
FUD0834 (structure + expand/scope), FUD0855 (two constants: structure.ts + prune.ts, only the
structure one emits), FUD0741 (config + vite), FUD0744 (vite + language-server), FUD0720-config
(config + cli scaffold + cli passthrough).

### MULTI-SEVERITY

- **FUD0720**: error (compiler host-bindings; CLI CliError for config) AND warning (vite
  reports `project.warnings` = config `FUD_CONFIG_MALFORMED` with `this.warn`). Mixed both by
  collision and by host.
- Every compiler `Diagnostic` reaching vite is reported per its own `severity`; config
  `FUD0720` is the only code whose severity changes by host (warning in the build, error in the
  CLI). No single construction site uses two severities for one code.

### MULTI-MESSAGE (same code, different templates)

0014 (identical text, 2 sites), 0056 (identical, 3 sites), 0071, 0072, 0075, 0099, 0110,
0131, 0151, 0154, 0155, 0156, 0158, 0199, 0291, 0360, 0363 (identical), 0392, 0420, 0421,
0423, 0433, 0445 (compiler), 0448 (cli, 13 templates), 0598, 0700, 0720 (config: 8 templates
+ cli 1), 0740, 0741, 0744 (near-identical), 0761, 0784, 0785, 0802, 0823, 0826, 0836, 0834,
0390 (discarded).

### RELATED (secondary locations)

FUD0831 (`expand/check.ts:179`), FUD0834 (`document/structure.ts:251`,
`expand/scope.ts:282` — the latter may set `related[].file`).

### FILE-FIELD

- Compiler `Diagnostic.file` is set GENERICALLY, not per code: `expand/expand.ts:415`
  (`#report`), `expand/check.ts:293`, `expand/report.ts:37` (`remapDiagnostics`) re-file any
  diagnostic produced inside a snippet body to the snippet's file. Any source code can
  therefore arrive with `file`.
- CSS: FUD0850/0851/0853/0856/0857/0858 travel wrapped in `FileDiagnostic { file, diagnostic }`
  (`css/flatten.ts`, `emit/prune.ts:514`).
- `FudicDiagnostic` (vite) always has `file`; `ConfigDiagnostic` always has `file` (+ optional
  span); `CliError` has optional `file`.
- `vite/src/styles.ts:263-273` (`located`) converts compiler FUD0743/FUD0854 into
  `ConfigDiagnostic` with `file`, `span`, and a `line:col:` prefix in the message.

---

## 2. Emitted codes (sorted)

Flags: COLL = collision, MS = multi-severity, MM = multi-message, REL = related, FILE = sets
`file`, DISC = constructed but discarded.

| Code | Meaning | Severity | Shape | Emission sites | Flags |
|---|---|---|---|---|---|
| FUD0001 | ModeStack pop on background mode | error | source | compiler/src/types/mode.ts:61 | |
| FUD0002 | Unterminated balanced group | error | source | compiler/src/balancer/balancer.ts:464 | |
| FUD0003 | Unterminated string literal | error | source | compiler/src/balancer/balancer.ts:308 | |
| FUD0004 | Unterminated template literal | error | source | compiler/src/balancer/balancer.ts:338 | |
| FUD0005 | Unterminated block comment | error | source | compiler/src/balancer/balancer.ts:365 | |
| FUD0006 | Unterminated regex literal | error | source | compiler/src/balancer/balancer.ts:422 | |
| FUD0007 | Expected opener at opening offset | error | source | compiler/src/balancer/balancer.ts:446 | |
| FUD0010 | Char after `@` starts no Razor construct | error | source | compiler/src/lexer/lexer.ts:353 | |
| FUD0011 | Unterminated Razor comment | error | source | compiler/src/lexer/lexer.ts:361 | |
| FUD0012 | Unterminated HTML comment | error | source | compiler/src/lexer/lexer.ts:412 | |
| FUD0013 | Malformed tag | error | source | compiler/src/lexer/lexer.ts:404 | |
| FUD0014 | Unterminated raw-text element | error | source | compiler/src/lexer/lexer.ts:705, :723 | MM(identical) |
| FUD0015 | Unterminated attribute value | error | source | compiler/src/lexer/lexer.ts:636 | |
| FUD0016 | Unterminated CDATA | error | source | compiler/src/lexer/lexer.ts:422 | |
| FUD0051 | Close tag matches no open element | error | source | compiler/src/html/parser.ts:498 | |
| FUD0052 | Unclosed element | error | source | compiler/src/html/parser.ts:461 | |
| FUD0053 | Close tag on void element | error | source | compiler/src/html/parser.ts:495 | |
| FUD0054 | CDATA outside SVG/MathML | error | source | compiler/src/html/parser.ts:289 | |
| FUD0055 | No parser injected for `@keyword` | error | source | compiler/src/html/parser.ts:846 | |
| FUD0056 | Unquoted attribute value | error | source | compiler/src/html/parser.ts:723, :751, :757 | MM(identical); keyed in LS REPAIRS |
| FUD0057 | Unknown character reference | error | source | compiler/src/html/parser.ts:348 | |
| FUD0070 | Expected `(` after control keyword | error | source | compiler/src/control/control.ts:433 | |
| FUD0071 | Expected `{` to open block | error | source | compiler/src/control/control.ts:447, :653; compiler/src/layout/layout.ts:314; compiler/src/snippet/parser.ts:242 | MM; 3 definitions |
| FUD0072 | Unclosed block, expected `}` | error | source | compiler/src/control/control.ts:455, :668; compiler/src/layout/layout.ts:322; compiler/src/snippet/parser.ts:250 | MM; 3 definitions |
| FUD0073 | `else` without `@if` | error | source | compiler/src/control/control.ts:630 | |
| FUD0074 | Content in @switch body that is not a label | error | source | compiler/src/control/control.ts:710 | |
| FUD0075 | Missing `:` after case/default | error | source | compiler/src/control/control.ts:725, :734 | MM |
| FUD0091 | Property binding concatenates parts | error | source | compiler/src/binding/classify.ts:250 | |
| FUD0092 | Event binding value not one `@` handler | error | source | compiler/src/binding/classify.ts:208 | |
| FUD0093 | `class:`/`style:` value not one `@` expr | error | source | compiler/src/binding/classify.ts:437 | |
| FUD0094 | `ref` value not a simple identifier | error | source | compiler/src/binding/classify.ts:466 | |
| FUD0095 | `class:`/`style:` with no name | error | source | compiler/src/binding/classify.ts:428 | |
| FUD0096 | `bus:` value not one `@` handler | error | source | compiler/src/binding/classify.ts:444 | |
| FUD0097 | `bus:` with no event name | error | source | compiler/src/binding/classify.ts:173 | |
| FUD0098 | Expression attribute name outside `bus:` | error | source | compiler/src/binding/classify.ts:144 | |
| FUD0099 | Prefix (`@`, `.`, `delegate:`) with no name | error | source | compiler/src/binding/classify.ts:197, :237, :305 | MM |
| FUD0110 | Expected `{` after @code/@server/@client | error | source | compiler/src/code/code.ts:229, :284 | MM |
| FUD0111 | `@server`/`@client` take no parameter | error | source | compiler/src/code/code.ts:218 | |
| FUD0114 | Razor comment inside @code | error | source | compiler/src/code/code.ts:328 | |
| FUD0131 | Unbalanced CSS braces in `<style>` | error | source | compiler/src/css/css.ts:97, :152 | MM |
| FUD0132 | Razor inside `<style>` (any, decision 136) | error | source | compiler/src/css/css.ts:162 (msg const `RAZOR_IN_CSS` at :38) | |
| FUD0150 | Doctype is not `<!DOCTYPE html>` | error | source | compiler/src/document/structure.ts:916 | |
| FUD0151 | Page skeleton html/head/body | error | source | compiler/src/document/structure.ts:933, :942 | MM |
| FUD0152 | `<link rel="component">` outside head | error | source | compiler/src/document/structure.ts:992 | |
| FUD0153 | @code outside head | error | source | compiler/src/document/structure.ts:996 | |
| FUD0154 | More than one @code | error | source | compiler/src/document/structure.ts:447, :689, :781 | MM |
| FUD0155 | Component top-level order / >1 head | error | source | compiler/src/document/structure.ts:436, :454 | MM |
| FUD0156 | Bad host wrapper | error | source | compiler/src/document/structure.ts:555, :557, :559 | MM |
| FUD0157 | Host wrapper lacks exactly one template | error | source | compiler/src/document/structure.ts:573 | |
| FUD0158 | Bad/missing shadowrootmode | error | source | compiler/src/document/structure.ts:579, :581 | MM |
| FUD0159 | More than one `<style>` in component head | error | source | compiler/src/document/structure.ts:596 | |
| FUD0160 | `host` attribute written in source | error | source | compiler/src/document/structure.ts:601 | |
| FUD0161 | `<script>` of code with a body | error | source | compiler/src/semantic/analyzers/script-body.ts:51 (also run from emit/registry via `checkScriptBody`) | |
| FUD0170 | Oxc JS/TS syntax error (mapped span) | error | source | compiler/src/oxc/batch.ts:177 | message = Oxc's |
| FUD0190 | Duplicate attribute | error | source | compiler/src/semantic/analyzers/duplicate-attributes.ts:25 | |
| FUD0191 | Custom element without `<link rel="component">` | error | source | compiler/src/semantic/analyzers/component-declared.ts:34 | keyed in LS REPAIRS |
| FUD0192 | `ref` inside a loop | error | source | compiler/src/semantic/analyzers/ref-in-loop.ts:35 | |
| FUD0193 | Nested @server/@client | error | source | compiler/src/semantic/analyzers/code-region-nesting.ts:38 | |
| FUD0194 | More than one @server/@client | error | source | compiler/src/semantic/analyzers/code-region-uniqueness.ts:34 | |
| FUD0195 | Non-primitive interpolation | error | source | compiler/src/semantic/analyzers/primitive-interpolation.ts:29 | |
| FUD0196 | Side-effect import in neutral zone | warning | source | compiler/src/semantic/analyzers/neutral-imports.ts:34 | |
| FUD0197 | Required prop not passed | error | source | compiler/src/semantic/analyzers/component-props.ts:93 (fn `checkComponentProps`, also called from emit/registry.ts:127) | retired on paper by SDD-35, still emitted |
| FUD0198 | `.prop` the child does not declare | error | source | compiler/src/semantic/analyzers/component-props.ts:78 (same two callers) | idem |
| FUD0199 | `slot=` fills nothing / undeclared slot | error | source | compiler/src/semantic/analyzers/slot-name.ts:53, :62, :67 | MM; idem SDD-35 |
| FUD0200 | Signal prop fed with non-signal | error | source | compiler/src/semantic/analyzers/prop-channel.ts:104 | |
| FUD0201 | Function prop fed with non-function | error | source | compiler/src/semantic/analyzers/prop-channel.ts:94 | |
| FUD0202 | Cell crosses into non-hydrating component | error | source | compiler/src/semantic/analyzers/prop-channel.ts:120 | |
| FUD0203 | Computed crosses into a written prop | error | source | compiler/src/semantic/analyzers/prop-channel.ts:133 | |
| FUD0290 | `$`-prefixed identifier in @client | error | source | compiler/src/emit/oxc-code.ts:1024 | |
| FUD0291 | Unsuitable event handler | error | source | compiler/src/semantic/analyzers/event-handler-shape.ts:50; compiler/src/emit/markup-client.ts:1192 (const from emit/events.ts:43) | MM; 2 definitions |
| FUD0294 | Author wrote reserved `data-fud-*` | error | source | compiler/src/semantic/analyzers/reserved-attributes.ts:71 | |
| FUD0360 | Malformed/duplicate route param | warning (vite) | file | vite/src/routing.ts:68, :76 | MM |
| FUD0361 | Route collision | warning | file | vite/src/routing.ts:129 | |
| FUD0362 | paths() entry misses a param | warning | file (plugin-string) | vite/src/plugin.ts:1659 | |
| FUD0363 | Asset not found | warning | file (plugin-string) | vite/src/plugin.ts:1140, :1167 | MM(identical) |
| FUD0364 | Route default matches no route | warning | file | vite/src/discover.ts:100 | |
| FUD0365 | manifestUrl not absolute | (never reported) | file | vite/src/options.ts:65 | DISC (plugin.ts:499 keeps only `.options`) |
| FUD0366 | Public file reached by relative path | error | project (plugin-string) | vite/src/plugin.ts:1687 | |
| FUD0390 | sw.json malformed | (never reported) | file | vite/src/swconfig.ts:96, :104, :113 | DISC (plugin.ts:504 keeps only `.config`); MM |
| FUD0391 | Shell entry not in build output | warning | file (plugin-string) | vite/src/plugin.ts:1731 | |
| FUD0392 | Invalid TTL | warning (manifest) / never reported (swconfig) | file | vite/src/manifest.ts:72; vite/src/swconfig.ts:122 | MM; swconfig site DISC |
| FUD0393 | strategy() not a literal | warning | file | vite/src/strategy.ts:105 | |
| FUD0394 | strategy() called twice | warning | file | vite/src/strategy.ts:95 | |
| FUD0396 | page.ttl differs from data.ttl | warning | file | vite/src/manifest.ts:93 | |
| FUD0397 | strategy() and defaults both | warning | file | vite/src/mode.ts:105 | |
| FUD0398 | ssg param route without paths() | warning | file | vite/src/mode.ts:131 | |
| FUD0399 | No linkable chunk for route | warning | project (plugin-string) | vite/src/plugin.ts:1615 | |
| FUD0420 | More than one layout link | error | source | compiler/src/document/structure.ts:678, :774 | MM |
| FUD0421 | Route top-level order / >1 head / nested @section | error | source | compiler/src/document/structure.ts:666, :696, :722 | MM |
| FUD0423 | Layout without @RenderBody() | error | source | compiler/src/document/structure.ts:850; compiler/src/emit/resolve.ts:480 | MM; 2 definitions |
| FUD0424 | Repeated @RenderBody/@RenderHead | error | source | compiler/src/document/structure.ts:355 | |
| FUD0425 | Layout without @RenderHead() | warning | source | compiler/src/document/structure.ts:862 | |
| FUD0426 | Render directives outside a layout | error | source | compiler/src/document/structure.ts:316 | |
| FUD0427 | @section outside a route | error | source | compiler/src/document/structure.ts:326 | |
| FUD0428 | Duplicate section name | error | source | compiler/src/document/structure.ts:342 | |
| FUD0429 | Section not rendered by layout | warning | source | compiler/src/emit/resolve.ts:539 | |
| FUD0430 | Layout exports load | error | source | compiler/src/semantic/analyzers/layout-load.ts:42 | |
| FUD0431 | @RenderHead() outside head | error | source | compiler/src/document/structure.ts:856 | |
| FUD0432 | Directive without parentheses | error | source | compiler/src/layout/layout.ts:301 | |
| FUD0433 | Bad directive argument | error | source | compiler/src/layout/layout.ts:193, :237, :243, :251, :259, :268, :280 | MM |
| FUD0434 | Orphan layout | warning | file | vite/src/discover.ts:88 | |
| FUD0435 | layout link points at non-layout | error | source | compiler/src/emit/resolve.ts:481 | |
| FUD0436 | `<link rel="layout">` without static href | error | source | compiler/src/document/structure.ts:296 | |
| FUD0438 | Framework link not top-level | error | source | compiler/src/document/structure.ts:972 | |
| FUD0439 | Layout declares `<link rel="layout">` | error | source | compiler/src/document/structure.ts:879 | |
| FUD0440 | (A) required section missing / (B) cli invalid tag | error | (A) source / (B) project | (A) compiler/src/layout/contract.ts:55 · (B) cli/src/tag.ts:57 | COLL; LS REPAIRS keys (A) |
| FUD0441 | (A) text in slotted hole / (B) cli tag exists | error | (A) source / (B) project | (A) compiler/src/layout/contract.ts:109 · (B) cli/src/tag.ts:65 | COLL |
| FUD0442 | (A) own slot in slotted hole / (B) cli reserved tag | error | (A) source / (B) project | (A) compiler/src/layout/contract.ts:121 · (B) cli/src/tag.ts:62 | COLL |
| FUD0443 | (A) hole in construct / (B) cli target exists | error | (A) source / (B) file | (A) compiler/src/semantic/analyzers/layout-body.ts:72 (also run by emit/layout-code) · (B) cli/src/plans/scaffold.ts:87, cli/src/project.ts:161 | COLL; (B) MM |
| FUD0444 | (A) @render arg without `@` / (B) cli `--in` missing | error | (A) source / (B) file | (A) compiler/src/snippet/parser.ts:367 · (B) cli/src/plans/component.ts:91 | COLL; LS REPAIRS keys (A) |
| FUD0445 | (A) `@` arg not a path / (B) cli `--in` unparsable | error | (A) source / (B) file | (A) compiler/src/snippet/parser.ts:352, :358 · (B) cli/src/plans/component.ts:99 | COLL; (A) MM; cli BROKEN_SOURCE keys (B) |
| FUD0446 | Requested section the layout lacks | error | project | cli/src/plans/page.ts:90 | |
| FUD0447 | Adapter unavailable | error | project | cli/src/plans/scaffold.ts:75 | |
| FUD0448 | CLI usage error | error | project | cli/src/args.ts:149, :195, :215, :231, :235, :239, :243, :272, :276, :304, :306, :378; cli/src/route.ts:32 | MM |
| FUD0449 | `--layout` is not a layout | error | file | cli/src/layout.ts:97 | |
| FUD0450 | `fudic fmt`: file does not parse | error | file | cli/src/plans/fmt.ts:62 | BROKEN_SOURCE key |
| FUD0451 | Plan command failed / not startable | error | project | cli/src/diagnostics.ts:77 (`commandFailed`, called cli/src/run.ts:116) | MM (2 branches) |
| FUD0460 | href resolves to no .fud | error | source | language-server/src/diagnostics.ts:29 (`hrefUnresolved`, called services/href.ts:135) | |
| FUD0461 | `$`-prefixed user identifier | error | source | language-server/src/diagnostics.ts:41 (`reservedDollar`, called services/reserved-dollar.ts:77) | |
| FUD0480 | `<style>` left unformatted | info | source | formatter/src/diagnostics.ts:66 (`styleNotFormatted`, called leaf/css.ts:41) | |
| FUD0481 | JS fragment left unformatted | info | source | formatter/src/diagnostics.ts:81 (`fragmentNotFormatted`, called leaf/collect.ts:261) | |
| FUD0482 | Formatter internal failure | error | source | formatter/src/diagnostics.ts:39 (`internalFailure`, called format.ts:100, :141) | |
| FUD0500 | Chunk without build hash | warning | file | vite/src/rename.ts:66 | |
| FUD0501 | Chunk name collision after rename | warning | file | vite/src/rename.ts:88 | |
| FUD0540 | Loop without `key (…)` | error | source | compiler/src/control/control.ts:520 | keyed: LS REPAIRS, formatter KEY_RULES |
| FUD0541 | Empty `key (…)` | error | source | compiler/src/control/control.ts:527 | formatter KEY_RULES |
| FUD0542 | `key` on non-loop | error | source | compiler/src/control/control.ts:540 | formatter KEY_RULES |
| FUD0543 | Loop header declares no binding | error | source | compiler/src/emit/block.ts:164 | |
| FUD0570 | effect() outside @client | error | source | compiler/src/emit/oxc-code.ts:990 | |
| FUD0590 | control value not an `@` expression | error | source | compiler/src/binding/classify.ts:449 | |
| FUD0591 | Form node bound twice | error | source | compiler/src/semantic/analyzers/control-uniqueness.ts:64 | |
| FUD0592 | control on unsupported element | error | source | compiler/src/semantic/analyzers/control-element.ts:46 (messages in `MESSAGES` :30-34) | MM (2 reasons) |
| FUD0593 | formassociated outside root template | error | source | compiler/src/semantic/analyzers/form-associated-placement.ts:70 | |
| FUD0594 | control inside a loop | error | source | compiler/src/semantic/analyzers/control-in-loop.ts:41 | |
| FUD0595 | control with no `<form control>` above | error | source | compiler/src/semantic/analyzers/control-inside-form.ts:74 | |
| FUD0596 | error=/summary= value not `@` expr | error | source | compiler/src/binding/classify.ts:458 | |
| FUD0597 | Marker with no bound control | error | source | compiler/src/binding/markers.ts:170 (problem; reported semantic/analyzers/error-marker.ts:37) | |
| FUD0598 | Marker in loop / second marker | error | source | compiler/src/binding/markers.ts:125, :129 (reported error-marker.ts:37) | MM |
| FUD0599 | Marker with content / non-static id | error | source | compiler/src/binding/markers.ts:137 (reported error-marker.ts:37) | |
| FUD0600 | error= on form/group | error | source | compiler/src/binding/markers.ts:179 (reported error-marker.ts:37) | |
| FUD0601 | summary= on a control | error | source | compiler/src/binding/markers.ts:183 (reported error-marker.ts:37) | |
| FUD0602 | summary= on element that can't hold a list | error | source | compiler/src/binding/markers.ts:145 (reported error-marker.ts:37) | |
| FUD0605 | Bad shadowrootreferencetarget | error | source | compiler/src/binding/bridge.ts:78 (problem; reported form-associated-placement.ts:55) | type-literal `'FUD0605'` at bridge.ts:35 |
| FUD0620 | Prerender failed | error | project (plugin-string) | vite/src/plugin.ts:1672 | |
| FUD0621 | Client reads `data` with no `load` | warning | source | compiler/src/emit/maps.ts:351 | |
| FUD0622 | Route chunk name = component tag | error | project (plugin-string) | vite/src/plugin.ts:938 | |
| FUD0660 | `$name` with no `delegate:` descendant | error | source | compiler/src/semantic/delegation.ts:451 | |
| FUD0661 | Marker no ancestor reads | error | source | compiler/src/semantic/delegation.ts:403 | |
| FUD0662 | Name not a loop-header binding | error | source | compiler/src/semantic/delegation.ts:496 | |
| FUD0663 | delegate: outside a loop | error | source | compiler/src/semantic/delegation.ts:384 | |
| FUD0664 | Two loops delegate same name | error | source | compiler/src/semantic/delegation.ts:430 | |
| FUD0665 | Non-bubbling event delegated | error | source | compiler/src/semantic/delegation.ts:476 | |
| FUD0666 | `$name` outside event-binding args | error | source | compiler/src/semantic/delegation.ts:317 | |
| FUD0667 | delegate: marker with a value | error | source | compiler/src/binding/classify.ts:315 | |
| FUD0680 | Injected service nobody registers | error | source | compiler/src/emit/di-diagnostics.ts:270 | file has non-UTF8 bytes (grep sees it as binary) |
| FUD0681 | @server-injected name read by hydrating binding | error | source | compiler/src/emit/di-diagnostics.ts:198 | |
| FUD0682 | inject/provide in opposite zones | error | source | compiler/src/emit/oxc-code.ts:1348 | |
| FUD0683 | inject() in a route's @server | error | source | compiler/src/emit/di-diagnostics.ts:232 | |
| FUD0684 | Same token provided twice | error | source | compiler/src/emit/oxc-code.ts:1332 | |
| FUD0700 | Layout @code holds more than props | error | source | compiler/src/emit/layout-code.ts:82, :90, :104, :116 | MM |
| FUD0701 | Reactive layout prop | error | source | compiler/src/emit/layout-code.ts:192 | |
| FUD0702 | Route doesn't resolve required layout prop | error | source | compiler/src/emit/layout-code.ts:173 | |
| FUD0705 | `@{ }` in layout body | error | source | compiler/src/semantic/analyzers/layout-body.ts:45 (also run by emit/layout-code) | |
| FUD0720 | (A) `class:` on host / (B) fudic.json malformed | (A) error / (B) warning in vite, error in cli | (A) source / (B) file (+opt span) | (A) compiler/src/semantic/analyzers/host-bindings.ts:41 · (B) config/src/read.ts:239 (`malformed()`, callers :87 :94 :98 :148 :157 :164 :191 :208); cli/src/plans/scaffold.ts:55; passthrough cli/src/workspace/target.ts:93 | COLL; MS; MM; FILE |
| FUD0721 | (A) unused component link / (B) sw.json but no id | (A) warning / (B) error | (A) source / (B) file | (A) compiler/src/emit/registry.ts:195 · (B) vite/src/config.ts:58 | COLL; FILE(B) |
| FUD0724 | Duplicate project id in workspace | error | project | cli/src/project.ts:82 (constant from config) | |
| FUD0740 | Style entry file missing/unreadable | error | file | config/src/styles.ts:82, :93 | MM |
| FUD0741 | Two sheets under one name | error | file | config/src/styles.ts:71; vite/src/styles.ts:226 | MM |
| FUD0742 | Project styles, no component | warning | project (plugin-string) | vite/src/plugin.ts:865 | |
| FUD0743 | Document-only selector in project sheet | warning | source (css) → file in vite | compiler/src/emit/styles-lint.ts:62 (relocated by vite/src/styles.ts:263) | |
| FUD0744 | adoptedstylesheets names unknown sheet | error | source | vite/src/transform.ts:178; language-server/src/services/template-attrs.ts:102 | MM(near-identical) |
| FUD0745 | adoptedstylesheets not literal | error | source | compiler/src/binding/adopt.ts:61 (problem; reported form-associated-placement.ts:60) | |
| FUD0760 | Link package specifier unresolved | error | file | vite/src/link-check.ts:97 | MM (2 branches) |
| FUD0761 | Two files/libraries define one tag | error | source (compiler) / project (cli) | compiler/src/emit/resolve.ts:391; cli/src/tag.ts:72 | MM; 2 definitions |
| FUD0763 | Link into non-library package | error | file | vite/src/link-check.ts:115 | |
| FUD0780 | Not inside a workspace | error | project | cli/src/workspace/place.ts:69 | |
| FUD0781 | No target project | error | project | cli/src/workspace/target.ts:80 | |
| FUD0782 | `--project` unknown | error | project | cli/src/workspace/target.ts:62 | |
| FUD0783 | Route in a library | error | project | cli/src/workspace/target.ts:109 | |
| FUD0784 | Project already exists | error | file | cli/src/workspace/place.ts:86, :101 | MM |
| FUD0785 | `--uses` not a library | error | project | cli/src/workspace/uses.ts:68 | MM (2 branches) |
| FUD0800 | Library peer range excludes compiler | error | file | vite/src/peer-check.ts:62 | supersedes 0762 |
| FUD0801 | Runtime piece missing | error | project (plugin-string) | vite/src/plugin.ts:821 | |
| FUD0802 | Output holds piece with other bytes | warning | file | vite/src/runtime-link.ts:445, :464 | MM |
| FUD0803 | Inline runtime without nonce | error | source-ish (plugin-string with file+offset) | vite/src/plugin.ts:1179 | |
| FUD0804 | fudic.runtime dir missing/empty | error | file | vite/src/runtime-pieces.ts:187 | |
| FUD0805 | Two packages publish same URL | error | file | vite/src/runtime-pieces.ts:147 | |
| FUD0806 | Piece carries build token | error | file | vite/src/runtime-link.ts:429 | keyed plugin.ts:1561 |
| FUD0820 | Bad/missing snippet name | error | source | compiler/src/snippet/parser.ts:200 | MM (2 branches) |
| FUD0821 | Missing parentheses (signature/args) | error | source | compiler/src/snippet/parser.ts:219 | |
| FUD0822 | `<style>` in snippet body | error | source | compiler/src/snippet/body-rules.ts:49 (emitted :70) | |
| FUD0823 | @code in snippet body / snippet file | error | source | compiler/src/snippet/body-rules.ts:40 (emitted :70); compiler/src/document/structure.ts:524 | MM; 2 definitions |
| FUD0824 | Nested @snippet | error | source | compiler/src/document/structure.ts:272 | |
| FUD0825 | `<head>` in snippet body | error | source | compiler/src/snippet/body-rules.ts:55 (emitted :70) | |
| FUD0826 | Unknown snippet | error | source | compiler/src/expand/check.ts:99, :121 | MM |
| FUD0827 | Unknown snippet namespace | error | source | compiler/src/expand/check.ts:110 | |
| FUD0828 | Missing required argument | error | source | compiler/src/expand/check.ts:218 | |
| FUD0829 | Too many arguments | error | source | compiler/src/expand/check.ts:154 | |
| FUD0830 | Unknown named argument | error | source | compiler/src/expand/check.ts:168 | |
| FUD0831 | Argument given twice | error | source | compiler/src/expand/check.ts:179 | REL |
| FUD0832 | Positional after named | error | source | compiler/src/snippet/parser.ts:279 | |
| FUD0834 | Two snippets under one name | error | source | compiler/src/document/structure.ts:251; compiler/src/expand/scope.ts:282 | REL; MM; related.file; 2 definitions |
| FUD0835 | Snippet recursion | error | source | compiler/src/expand/check.ts:253 | |
| FUD0836 | Bad `<link rel="snippet">` | error | source | compiler/src/expand/scope.ts:233, :242, :252 | MM |
| FUD0850 | @import the build cannot read (external) | warning | source (css) | compiler/src/css/flatten.ts:438 | FILE (FileDiagnostic) |
| FUD0851 | Sheet unreadable as CSS | warning | source (css) | compiler/src/css/rules.ts:107 (`#fail`, callers :115 :134 :183) | MM; FILE (prune.ts:514) |
| FUD0852 | Unused sheet (dead CSS) | warning | file (plugin-string) | vite/src/plugin.ts:1711 (constant from compiler/src/emit/prune.ts:48) | |
| FUD0853 | @import target missing | error | source (css) | compiler/src/css/flatten.ts:334 | FILE |
| FUD0854 | @import in project sheet | error | source (css) → file in vite | compiler/src/emit/prune.ts:523 (relocated vite/src/styles.ts:268) | |
| FUD0855 | @import in component `<style>` | error | source | compiler/src/document/structure.ts:624 (dup constant prune.ts:52 never emits) | 2 definitions |
| FUD0856 | @import cycle | error | source (css) | compiler/src/css/flatten.ts:325 | FILE |
| FUD0857 | @import after a rule | warning | source (css) | compiler/src/css/flatten.ts:351 | FILE |
| FUD0858 | @import reordered | warning | source (css) | compiler/src/css/flatten.ts:447 | FILE |

### 2b. Message templates (verbatim from source)

```text
FUD0001  types/mode.ts:61            'mode stack underflow: pop on the background mode'
FUD0002  balancer.ts:464             `Unterminated group, expected '${closer}'`
FUD0003  balancer.ts:308             'Unterminated string literal'
FUD0004  balancer.ts:338             'Unterminated template literal'
FUD0005  balancer.ts:365             'Unterminated block comment'
FUD0006  balancer.ts:422             'Unterminated regular expression literal'
FUD0007  balancer.ts:446             `Expected '${opener}' at the opening offset`
FUD0010  lexer.ts:353                'character after @ does not start a Razor construct'
FUD0011  lexer.ts:361                'unterminated Razor comment'
FUD0012  lexer.ts:412                'unterminated HTML comment'
FUD0013  lexer.ts:404                'malformed tag'
FUD0014  lexer.ts:705, :723          `unterminated <${element}> element`
FUD0015  lexer.ts:636                'unterminated attribute value'
FUD0016  lexer.ts:422                'unterminated CDATA section'
FUD0051  html/parser.ts:498          `close tag </${name}> matches no open element`
FUD0052  html/parser.ts:461          `unclosed <${name}> element`
FUD0053  html/parser.ts:495          `void element <${name}> must not have a close tag`
FUD0054  html/parser.ts:289          'CDATA section outside SVG or MathML content'
FUD0055  html/parser.ts:846          `no parser injected for the @${keyword} construct`
FUD0056  html/parser.ts:723,751,757  'attribute value must be quoted'
FUD0057  html/parser.ts:348          `unknown character reference ${unknown.text}`
FUD0070  control.ts:433              "expected '(' after the control keyword"
FUD0071  control.ts:447              "expected '{' to open the block body"
         control.ts:653              "expected '{' to open the @switch body"
         layout/layout.ts:314        "expected '{' to open the block body"
         snippet/parser.ts:242       "expected '{' to open the block body"
FUD0072  control.ts:455              "unclosed block: expected '}'"
         control.ts:668              "unclosed @switch body: expected '}'"
         layout/layout.ts:322        "unclosed block: expected '}'"
         snippet/parser.ts:250       "unclosed block: expected '}'"
FUD0073  control.ts:630              'else without a matching @if'
FUD0074  control.ts:710              'only case and default labels may appear directly in a @switch body'
FUD0075  control.ts:725              "expected ':' to close the case label"
         control.ts:734              "expected ':' to close the default label"
FUD0091  classify.ts:250             'property binding value must not concatenate parts: use one value or one `@` expression'
FUD0092  classify.ts:208             'event binding value must be exactly one `@` handler (a reference or a lambda)'
FUD0093  classify.ts:437             `\`${kind}:\` binding value must be a single \`@\` expression`
FUD0094  classify.ts:466             'ref value must be a single simple identifier, e.g. `ref="@input"`'
FUD0095  classify.ts:428             `\`${kind}:\` binding has no name after \`:\``
FUD0096  classify.ts:444             'bus binding value must be exactly one `@` handler'
FUD0097  classify.ts:173             'bus binding has no event name after `bus:`'
FUD0098  classify.ts:144             `an expression attribute name is only valid after the reserved \`bus:\` prefix, not \`${prefix}\``
FUD0099  classify.ts:197             'event binding has no event name after `@`'
         classify.ts:237             'property binding has no property name after `.`'
         classify.ts:305             'delegation marker has no name after `delegate:`'
FUD0110  code/code.ts:229            `Expected '{' after @${name}`
         code/code.ts:284            "Expected '{' after @code"
FUD0111  code/code.ts:218            `@${name} does not take a parameter`
FUD0114  code/code.ts:328            'Razor comments are not allowed inside @code; comment the JavaScript with // or /*…*/'
FUD0131  css/css.ts:97               `Unbalanced CSS braces in <style>: ${this.#depth} block(s) left unclosed`
         css/css.ts:152              'Unbalanced CSS braces in <style>: unmatched }'
FUD0132  css/css.ts:162 (RAZOR_IN_CSS, :38)
         'Razor is not allowed inside <style>: its body is plain CSS. Write what changes in the markup (style=, style:, class:)'
FUD0150  structure.ts:916            'The doctype must be <!DOCTYPE html>'
FUD0151  structure.ts:933            'A page must have an <html> root'
         structure.ts:942            'A page must have <head> then <body> inside <html>'
FUD0152  structure.ts:992            '<link rel="component"> must live inside <head>'
FUD0153  structure.ts:996            '@code must live inside <head>'
FUD0154  structure.ts:447            'A component has at most one @code block'
         structure.ts:689            'A route has at most one @code block'
         structure.ts:781            'A document has at most one @code block'
FUD0155  structure.ts:436            'Top-level order must be link → @code → head → host'
         structure.ts:454            'A component has at most one <head> fragment'
FUD0156  structure.ts:555            'A component must have exactly one custom-element host wrapper'
         structure.ts:557            'A component must have exactly one root host wrapper'
         structure.ts:559            'The host wrapper tag must be a custom element (contain a hyphen)'
FUD0157  structure.ts:573            'The host wrapper must contain exactly one <template>'
FUD0158  structure.ts:579            'The <template> requires shadowrootmode="open"'
         structure.ts:581            'shadowrootmode must be "open" (closed is out of v1)'
FUD0159  structure.ts:596            'A component <head> fragment holds at most one <style>'
FUD0160  structure.ts:601            'The host attribute is a reserved output marker and cannot be written in source'
FUD0161  script-body.ts:51           'a `<script>` of code cannot carry a body: fudic does not support inline script, and the body is not emitted. Move the code to a file and reference it with `src`. Data blocks are supported inline: `application/ld+json` and `importmap`'
FUD0170  oxc/batch.ts:177            err.message   (Oxc's own message)
FUD0190  duplicate-attributes.ts:25  `duplicate attribute \`${attr.name}\``
FUD0191  component-declared.ts:34    `custom element \`<${el.name}>\` used without a \`<link rel="component">\` declaration`
FUD0192  ref-in-loop.ts:35           '`ref` is not allowed inside a loop (@foreach/@for/@while)'
FUD0193  code-region-nesting.ts:38   '`@server`/`@client` regions cannot be nested'
FUD0194  code-region-uniqueness.ts:34 `at most one \`${region}\` region is allowed per \`@code\``   (region = '@server' | '@client')
FUD0195  primitive-interpolation.ts:29 'interpolation of an array/object literal is not allowed; only scalar primitives'
FUD0196  neutral-imports.ts:34       'side-effect import in the neutral zone; only pure shared modules belong here'
FUD0197  component-props.ts:93       `\`${el.name}\` requires ${listed(missing)}`
FUD0198  component-props.ts:78       `\`${el.name}\` declares no property \`${prop.name}\``
FUD0199  slot-name.ts:53             `${label} fills nothing: it has no component parent`
         slot-name.ts:62             `${label} fills nothing: \`${host.name}\` is not a component`
         slot-name.ts:67             `\`${host.name}\` declares no slot \`${name}\``
FUD0200  prop-channel.ts:104         `\`.${binding.name}\` takes a Signal by reference: name a signal(…) or computed(…)`
FUD0201  prop-channel.ts:94          `\`.${binding.name}\` takes a function by reference: name one of @code { @client }`
FUD0202  prop-channel.ts:120         `\`${el.name}\` does not hydrate, so it can never receive \`.${binding.name}\` by reference`
FUD0203  prop-channel.ts:133         `\`${name}\` is a computed and \`${el.name}\` writes \`.${binding.name}\`: a derived value is not writable`
FUD0290  emit/oxc-code.ts:1024       `"${name(id)}" is reserved: the $ prefix belongs to the identifiers the compiler emits into this scope. Rename it — a trailing $ ("${name(id).slice(1)}$") is yours.`
FUD0291  event-handler-shape.ts:50   'an event handler must be a reference, a call, a lambda or a function'
         emit/markup-client.ts:1192  'event binding value must be a reference, a lambda or a call: this expression cannot be subscribed'
FUD0294  reserved-attributes.ts:71   `\`${attr.name}\` is reserved: the \`data-fud-\` namespace belongs to the compiler. Use a \`data-\` name of your own.`
FUD0360  vite routing.ts:68          `Malformed route param segment "[${name}]" in ${file}`
         vite routing.ts:76          `Duplicate route param ":${name}" in ${file}`
FUD0361  vite routing.ts:129         `Route "${c.pattern}" is produced by both ${owner} and ${file}`
FUD0362  vite plugin.ts:1659         `[${FUD_PATHS_INCOMPLETE}] paths() entry ${bad} does not cover every param of ${rb.route.pattern}`
FUD0363  vite plugin.ts:1140, :1167  `[${FUD_ASSET_NOT_FOUND}] asset "${spec}" not found (referenced by ${path})`
FUD0364  vite discover.ts:100        `Route default for "${pattern}" matches no route`
FUD0365  vite options.ts:65          `manifestUrl must be absolute (SW and WW load the same URL); got "${manifestUrl}"`
FUD0366  vite plugin.ts:1687         `[${FUD_PUBLIC_BY_PATH}] A public file is named by its URL, not by a path into the public directory: ` +
                                     `write "${url}". Reaching it with a relative path publishes a second, hashed copy of a file ` +
                                     'that is already served under its own name.'
FUD0390  vite swconfig.ts:96         `${file} is not valid JSON: ${(error as Error).message}`
         vite swconfig.ts:104        `${file} must be an object with a "shell" array`
         vite swconfig.ts:113        `${file}: resource "${name}" needs a pattern and a valid policy`
FUD0391  vite plugin.ts:1731         `[${FUD_SW_SHELL_MISSING}] shell entry "${entry}" is not in the build output`
FUD0392  vite manifest.ts:72         `strategy().data.ttl "${String(declared.ttl)}" is invalid (expected 30s/5m/2h/7d)`
         vite swconfig.ts:122        `${file}: resource "${name}" has an invalid ttl "${String(rule.ttl)}" (expected 30s/5m/2h/7d)`
FUD0393  vite strategy.ts:105        'strategy() needs an object literal with literal values (it is read statically, never run)'
FUD0394  vite strategy.ts:95         'A page may call strategy() only once; the first call wins'
FUD0396  vite manifest.ts:93         'page.ttl differs from data.ttl with cache:"persist"; the data TTL wins'
FUD0397  vite mode.ts:105            'This route declares strategy() and also appears in defaults; the page wins'
FUD0398  vite mode.ts:131            'A param route needs paths() to be prerendered; falling back to sw'
FUD0399  vite plugin.ts:1615         `[${FUD_CHUNK_NOT_EMITTED}] no linkable chunk for ${rb.route.pattern}`
FUD0420  structure.ts:678            'A route declares exactly one layout'
         structure.ts:774            'A document declares at most one layout'
FUD0421  structure.ts:666            'Top-level order must be layout link → component links → @code → head → markup'
         structure.ts:696            'A route has at most one <head> fragment'
         structure.ts:722            '@section must be a top-level node of the route'
FUD0423  structure.ts:850            'a layout must contain @RenderBody(): where does the route go?'
         emit/resolve.ts:480         `a layout must contain @RenderBody(): ${path}`
FUD0424  structure.ts:355            `a layout has at most one ${what}`   (what = '@RenderBody()' | '@RenderHead()')
FUD0425  structure.ts:862            "a layout without @RenderHead() appends the route's head contributions at the end of <head>"
FUD0426  structure.ts:316            '@RenderBody/@RenderHead/@RenderSection are only valid in a layout'
FUD0427  structure.ts:326            '@section is only valid in a route'
FUD0428  structure.ts:342            `duplicate ${what} "${node.name}"`   (what = 'section' | 'rendered section')
FUD0429  emit/resolve.ts:539         `no @RenderSection(${section.name}) in the layout chain: this section is not rendered`
FUD0430  layout-load.ts:42           'a layout cannot export load: it receives the route data (v1)'
FUD0431  structure.ts:856            '@RenderHead() must live inside <head>'
FUD0432  layout/layout.ts:301        `${label} requires parentheses: write ${label}()`
FUD0433  layout/layout.ts:193        '@RenderSection(name) expects a bare identifier'
         layout/layout.ts:237, :268  argumentMessage(label, allowed) =
                                       allowed.size === 0 ? `${label}() takes no arguments`
                                       : `${label} takes the named arguments ${[...allowed].map((k) => `\`${k}:\``).join(' and ')}, each at most once`
         layout/layout.ts:243        `${label}: expected ':' after \`${key.name}\``
         layout/layout.ts:251        `${label}: \`slot\` takes a string literal`
         layout/layout.ts:259        `${label}: \`required\` takes \`true\` or \`false\``
         layout/layout.ts:280        '@section expects a name'
FUD0434  vite discover.ts:88         'Layout is not referenced by any route: it renders nothing'
FUD0435  emit/resolve.ts:481         `<link rel="layout"> must point at a layout: ${path}`
FUD0436  structure.ts:296            '<link rel="layout"> requires a static href'
FUD0438  structure.ts:972            'A <link rel="component">, <link rel="layout"> or <link rel="snippet"> is a top-level node of the file: nested it registers nothing'
FUD0439  structure.ts:879            'a layout cannot declare <link rel="layout">: only a route may name a layout'
FUD0440A layout/contract.ts:55       `the layout requires the section${missing.length > 1 ? 's' : ''} ${names}: declare ${missing.length > 1 ? 'them' : 'it'} with \`@section name { … }\``
FUD0440B cli tag.ts:57               `invalid custom element name "${tag}": it must be kebab-case and contain a hyphen (e.g. "app-${tag || 'card'}")`
FUD0441A layout/contract.ts:109      `the layout puts this hole in the slot "${slot}", and only an element can carry \`slot\`: wrap this text in an element`
FUD0441B cli tag.ts:65               `a component named "${tag}" already exists in this project`
FUD0442A layout/contract.ts:121      `the layout already puts this hole in the slot "${slot}": remove this \`slot\``
FUD0442B cli tag.ts:62               `"${tag}" is reserved by the HTML/SVG/MathML specs and cannot be defined`
FUD0443A layout-body.ts:72           'a hole of the layout cannot live inside `@if`, `@switch` or a loop: the route would be written zero or many times. Keep the hole fixed and branch inside the route'
FUD0443B cli plans/scaffold.ts:87    `${name} already exists and is not empty; pass --force to overwrite`   (file: name)
         cli project.ts:161          `${file} already exists; pass --force to overwrite`   (file: file)
FUD0444A snippet/parser.ts:367       'an argument that reads the scope is written with `@`, as a prop is: `@name`, `@a.b` or `@( … )`; only a literal goes bare'
FUD0444B cli plans/component.ts:91   `--in ${into}: no such file`   (file: into)
FUD0445A snippet/parser.ts:352       'an argument written `@( … )` is that group and nothing after it'
         snippet/parser.ts:358       'an argument after a bare `@` is a name or a path: wrap anything else in `@( … )`'
FUD0445B cli plans/component.ts:99   `--in ${into}: the file does not parse; it was left untouched`   (file: into)
FUD0446  cli plans/page.ts:90        `the layout declares no @RenderSection(${name})${available.length > 0 ? `; it declares: ${available.join(', ')}` : ''}`
FUD0447  cli plans/scaffold.ts:75    `adapter '${opts.target}' is not available; installed adapters: ${AVAILABLE_TARGETS.join(', ')}`
FUD0448  cli args.ts:149             `flag --${name} needs a value`
         cli args.ts:195             `unknown flag --${name}`
         cli args.ts:215             `unknown command "${command ?? ''}"`
         cli args.ts:231             `unknown quote style "${quote}"`
         cli args.ts:235             `unknown line terminator "${endOfLine}"`
         cli args.ts:239             '--print-width needs a number'
         cli args.ts:243             '--tab-width needs a number'
         cli args.ts:272             'fudic new needs a project name'
         cli args.ts:276             `unknown package manager "${pm}"`
         cli args.ts:304             'fudic g needs a type: page (p), component (c) or layout (l)'
         cli args.ts:306             `fudic g ${type} needs a name`
         cli args.ts:378             `unknown type "${type}": expected app, lib, page, component or layout`
         cli route.ts:32             `invalid route segment "${part}" in "${route}"`
FUD0449  cli layout.ts:97            `"${explicit}" is not a layout (no doctype + @RenderBody())`   (file: explicit)
FUD0450  cli plans/fmt.ts:62         `${file} does not parse; left unchanged`   (file: file)
FUD0451  cli diagnostics.ts:77       failure.status === null
                                       ? `could not run \`${line}\`: is it installed and on your PATH?`
                                       : `\`${line}\` exited with code ${failure.status}`
FUD0460  language-server diagnostics.ts:29  `Cannot resolve "${href}" to a .fud file`
FUD0461  language-server diagnostics.ts:41  `"${name}" is reserved: identifiers starting with $ belong to the compiler`
FUD0480  formatter diagnostics.ts:66 `Left <style> unformatted: ${STYLE_REASON[reason]}`   (only reason: 'it does not parse as CSS')
FUD0481  formatter diagnostics.ts:81 'Left this expression unformatted: it does not parse as JavaScript'
FUD0482  formatter diagnostics.ts:39 `The formatter could not finish: ${reason}`
FUD0500  vite rename.ts:66           `chunk "${fileName}" does not end in a ${String(BUILD_ID_LENGTH)}-character hash; build-id naming needs the default build.rollupOptions.output`
FUD0501  vite rename.ts:88           `chunk name collision after build-id naming: "${to}" is produced by ${claimants.join(' and ')}`
FUD0540  control.ts:520              "a loop must declare 'key (…)'"
FUD0541  control.ts:527              "'key (…)' must hold an expression"
FUD0542  control.ts:540              "'key (…)' is only valid on a loop"
FUD0543  emit/block.ts:164           'a loop header that declares no binding cannot have a key that identifies its rows'
FUD0570  emit/oxc-code.ts:990        'effect(...) belongs in @code { @client }: an effect runs after the first render, and the server has none.'
FUD0590  classify.ts:449             'control value must be a single `@` expression naming a form node, e.g. `control="@f.title"`'
FUD0591  control-uniqueness.ts:64    `\`${expression}\` is already bound to another element in this component: a form node binds one element, unless every one of them is an \`<input type="radio">\``
FUD0592  control-element.ts:46 (MESSAGES)
         'no-value': '`control` needs an element that carries a user value: `submit`, `reset`, `button` and `image` inputs have none'
         file:       '`control` on `<input type="file">` is not supported: file upload needs multipart and a value that is not JSON'
FUD0593  form-associated-placement.ts:70 '`formassociated` belongs to the root `<template shadowrootmode>` of a component: it decides the emitted class, and there is none here'
FUD0594  control-in-loop.ts:41       '`control` is not allowed inside a loop (@foreach/@for/@while): the expression would bind every row to the same form node'
FUD0595  control-inside-form.ts:74   '`control` needs a `<form control="…">` above it: a node binds inside its own form, and a component that binds one it received must mark its template `formassociated`'
FUD0596  classify.ts:458             `${name} value must be a single \`@\` expression naming a form node, e.g. \`${example}\``
                                     (example = name === ERROR_NAME ? 'error="@f.title"' : 'summary="@f"')
FUD0597  markers.ts:170              `no element of this block binds \`${m.node}\` with \`control\`: a marker describes an element beside it — a native control, or a \`formassociated\` component`
FUD0598  markers.ts:125              `a \`${attr}\` marker cannot sit inside a loop: every row would carry the same id for \`${m.node}\``
         markers.ts:129              `\`${m.node}\` already has a marker in this component: a node speaks through one element`
FUD0599  markers.ts:137              `a \`${attr}\` marker must be empty and, if it has an \`id\`, a static one: the runtime writes its content, and \`aria-describedby\` has to name it`
FUD0600  markers.ts:179              `\`${m.node}\` is a ${first.kind}: its errors are a summary — write \`summary="@${m.node}"\``
FUD0601  markers.ts:183              `\`${m.node}\` is a control: its message is not a summary — write \`error="@${m.node}"\``
FUD0602  markers.ts:145              `a summary is a list, and a \`<${m.el.name}>\` cannot hold one: mark a \`<div>\` or a \`<section>\``
FUD0605  binding/bridge.ts:78        `\`${REFERENCE_TARGET_ATTR}\` must be a static id of an element of this template: the bridge points at an element the compiler can see`
FUD0620  vite plugin.ts:1672         `[${FUD_PRERENDER_FAILED}] ${rb.route.pattern} failed to prerender: ${(err as Error).message}`
FUD0621  emit/maps.ts:351            'The client half reads `data` and this route declares no `load`: what it finds there is `undefined`, always.'
FUD0622  vite plugin.ts:938          `[${FUD_ROUTE_NAME_COLLISION}] the chunk of route ${route.pattern} would be named "${route.name}", which is already a component tag`
FUD0660  delegation.ts:451           `no descendant declares \`delegate:${read.name}\`: \`$${read.name}\` would have no row to read`
FUD0661  delegation.ts:403           `no ancestor handler reads \`$${marker.name}\`: this marker is never read`
FUD0662  delegation.ts:496           `\`${marker.name}\` is not a binding of the loop header: ${offer}`
                                     (offer = `this loop declares ${available}` | 'this loop declares no binding to delegate')
FUD0663  delegation.ts:384           '`delegate:` is only allowed inside a loop (@foreach/@for/@while): outside one there is no row to identify'
FUD0664  delegation.ts:430           `\`${marker.name}\` is already delegated to that handler by another loop: one name, one loop`
FUD0665  delegation.ts:476           `\`${reader.eventName}\` does not bubble, so it can never be delegated${advice}`
                                     (advice = '' | `, use \`@${substitute}\``)
FUD0666  delegation.ts:317           `\`${String(found['name'])}\` is only readable in the argument list of an event binding`
FUD0667  classify.ts:315             '`delegate:` marker takes no value: the ancestor handler reads it as `$' + (name.length > 0 ? name : 'name') + '`'
FUD0680  emit/di-diagnostics.ts:270  `Nothing registers \`${call.provider}\`: its module neither calls \`Service(${call.provider})\` nor \`provide(${call.provider}, …)\`, and no component provides it`
FUD0681  emit/di-diagnostics.ts:198  `\`${read}\` is injected in @server and read by a binding of a component that hydrates: @server never reaches the browser chunk, so the first update throws on a name that is not there.`
FUD0682  emit/oxc-code.ts:1348       `\`${call.provider}\` is injected in @${call.zone} but this @code only provides it in ${there}: the two never run on the same side. Move the provider to the neutral zone to have it on both.`
FUD0683  emit/di-diagnostics.ts:232  `A route resolves through \`ctx.inject(…)\`: \`load(ctx)\` is the only async function of the system and takes no ambient container, so \`inject(…)\` here has none to read.`
FUD0684  emit/oxc-code.ts:1332       `\`${call.provider}\` is provided twice in this @code: the second registration replaces the first, and one of the two factories never runs.`
FUD0700  emit/layout-code.ts:82      'a layout has no `@server` region: it would be a second `load` with no route to call it. Its data comes from the route, which resolves its props in `export function layout(ctx, data)`'
         emit/layout-code.ts:90      'a layout has no `@client` region: there is no layout chunk for it to travel in, and a layout prop is a render value that never repaints'
         emit/layout-code.ts:104     'the `@code` of a layout declares its props and nothing else: this statement would run in both renderers with nobody able to say when'
         emit/layout-code.ts:116     `a layout declares no reactive state: \`${reactive.name}\` has no half of client that could repaint it`
FUD0701  emit/layout-code.ts:192     `the layout prop \`${prop.name}\` may not be reactive: a layout has no half of client that could repaint it, and a chunk that had to know which of its nodes to repaint would have to anchor them (SDD-39 §4.3)`
FUD0702  emit/layout-code.ts:173     `the layout requires the prop \`${prop.name}\`${prop.type === undefined ? '' : `: ${prop.type}`} and this route does not resolve it — return it from \`export function layout(ctx, data)\``
FUD0705  layout-body.ts:45           'the <body> of a layout writes no `@{ }`: a layout declares its props and no logic of its own — what the block would compute belongs to a component or to the route'
FUD0720A host-bindings.ts:41         '`class:` on the component\'s own tag styles nothing: the classes of this file live inside its shadow, and a class on the host is resolved against the page — write the class where it applies, or expose the state as an attribute'
FUD0720B config read.ts:239          `${CONFIG_FILE} ${what}`  with what =
                                       :87  `could not be read: ${reason(error)}`
                                       :94  `is not valid JSON: ${reason(error)}`
                                       :98  'must be a JSON object'
                                       :148 `"${field}" must be an object of "name": "path" — a sheet for every component goes in ` + '"globalStyles", one a component chooses goes in "styles"'
                                       :157 `"${field}" must be an object of "name": "path"`
                                       :164 `"${field}.${name}" must be a path, under a name matching ${STYLE_NAME_PATTERN.source} ` + '(no hyphen: the hyphen is what makes a tag)'
                                       :191 `"${field}" must be a string matching ${pattern.source} (${note})`
                                       :208 '"kind" must be "app" or "lib"'
         cli plans/scaffold.ts:55    `--${field} "${value}" is not usable in ${CONFIG_FILE}: it must match ${pattern.source}`   (file: CONFIG_FILE)
FUD0721A emit/registry.ts:195        `\`<${tag}>\` is declared here and used nowhere in this file: the \`<link rel="component">\` can go`
FUD0721B vite config.ts:58           `${SW_CONFIG_FILE} is present, so ${CONFIG_FILE} must declare an "id": it is what namespaces this application's caches, and without it two apps on one origin wipe each other's`
FUD0724  cli project.ts:82           `the id "${id}" is declared by more than one project: ${dirs.join(', ')}`
FUD0740  config styles.ts:82         `${CONFIG_FILE}: "${name}": "${entry}" does not exist.`
         config styles.ts:93         `${CONFIG_FILE}: "${name}": "${entry}" could not be read: ${error instanceof Error ? error.message : String(error)}`
FUD0741  config styles.ts:71         `${CONFIG_FILE}: "${name}" is both in "globalStyles" and in "styles". A name is ` + 'one sheet in the module map — rename one.'
         vite styles.ts:226          `"${first}" and "${second}" both declare a stylesheet named "${specifier}". Two sheets ` +
                                     'under one name cannot be told apart in the module map, and one would silently ' +
                                     'replace the other — rename one of the two.'
FUD0742  vite plugin.ts:865          `[${FUD_STYLES_NOT_ADOPTED}] ${CONFIG_FILE} declares stylesheets and this project defines no component: ` +
                                     'a project sheet is adopted into the shadow roots of its own components, and there are none. ' +
                                     'A stylesheet meant for the document goes in a <link rel="stylesheet"> in the layout.'
FUD0743  emit/styles-lint.ts:62      messageFor(name) = `a "${name}" rule in a project stylesheet matches nothing inside a shadow root — ` +
                                     'move it to the document stylesheet, the <link rel="stylesheet"> of the layout'
FUD0744  vite transform.ts:178       `"${name}" is not a stylesheet of this project: a component chooses from the "styles" of its fudic.json` +
                                     (choosable.size === 0 ? ', and it declares none' : ` (${[...choosable.keys()].join(', ')})`)
         language-server services/template-attrs.ts:102
                                     `"${name}" is not a stylesheet of this project: a component chooses from the "styles" of its fudic.json` +
                                     (choosable.length === 0 ? ', and it declares none' : ` (${choosable.join(', ')})`)
FUD0745  binding/adopt.ts:61         `\`${ADOPTED_STYLESHEETS_ATTR}\` must be a literal list of names: the sheets are chosen when the component is compiled`
FUD0760  vite link-check.ts:97       resolution.reason === 'not-installed'
                                       ? `"${href}" names a package that is not installed. Add it to this project's ` + 'dependencies and install — the file cannot be found until the package is there.'
                                       : `the package "${packageOf(href)}" is installed but does not publish ` + `"${href}". Its "exports" decides what a consumer may link; the fix is in that ` + "package's package.json, not in an install."
FUD0761  emit/resolve.ts:391         `two files define the tag "${doc.name}": ${defined} and ${path}. customElements is one registry per document, so the second define() throws`
         cli tag.ts:72               `the library "${defined.library}" already defines "${tag}" (${defined.file}). ` +
                                     'customElements is one registry per document, so the second define() throws: give this ' +
                                     "one another name, or a prefix of this project's own"
FUD0763  vite link-check.ts:115      `"${href}" resolves inside "${resolution.target.name}", which does not declare ` +
                                     'itself a fudic library. A package is consumable when its fudic.json says ' +
                                     '{ "kind": "lib" }; without it, what you are linking is somebody\'s private file.'
FUD0780  cli workspace/place.ts:69   `not inside a workspace: no ${WORKSPACE_FILE} here or above. ` + 'Create one with `fudic new <name> --workspace`.'
FUD0781  cli workspace/target.ts:80  `no target project: there is no ${CONFIG_FILE} here or above. ` + 'Run this inside a project, or name one with --project.'
FUD0782  cli workspace/target.ts:62  `--project ${project}: no such project${names.length === 0 ? ' — there are none here' : `; there is: ${names.join(', ')}`}`
FUD0783  cli workspace/target.ts:109 `${target.dir} is a library, and a library has no routes: no base, no URL, and no plugin ` + 'builds it. A layout can live here; a page cannot.'
FUD0784  cli workspace/place.ts:86   `a project named "${name}" is already at ${relativeTo(root, taken.path)}; ` + 'pass --force to overwrite'   (file: relativeTo(opts.cwd, taken.path))
         cli workspace/place.ts:101  `${relativeTo(root, target)} is already a fudic project; pass --force to overwrite`   (file: relativeTo(opts.cwd, target))
FUD0785  cli workspace/uses.ts:68    project === undefined
                                       ? `--uses ${name}: no such project in the workspace${listOf(projects)}`
                                       : `--uses ${name}: that is an app, and an app exports nothing${listOf(projects)}`
FUD0800  vite peer-check.ts:62       `the library "${pkg.name === '' ? pkg.root : pkg.name}" was written for ` +
                                     `${COMPILER_PACKAGE} "${range}", and this build resolved ${resolved.version}. A library ` +
                                     'publishes .fud source, so that compiler is the one parsing it: what a mismatch produces ' +
                                     'is a syntax error in a file you did not write. Upgrade one of the two, or ask the ' +
                                     'library to widen its range.'
FUD0801  vite plugin.ts:821          `[${FUD_RUNTIME_PIECE_MISSING}] the published runtime of this build has no ` +
                                     `"${name}", which every route that hydrates has to start. Run the publisher's ` +
                                     'build, or check that its version is the one this project resolves.'
FUD0802  vite runtime-link.ts:445    `the output already holds "${piece.url}" with different bytes than "${piece.pkg}" ` +
                                     'would copy there. Two applications sharing an origin write the same file with the ' +
                                     'same content, because the framework built it and not their builds: different ' +
                                     'content means one version of the package was published twice with two contents, ' +
                                     'and whichever deploys last decides what every page of the origin runs.'
         vite runtime-link.ts:464    `the output already holds the source map of "${piece.url}" with different bytes ` +
                                     `than "${piece.pkg}" would copy there. Same cause as a piece that differs: one ` +
                                     'version of the package was published twice with two contents.'
FUD0803  vite plugin.ts:1179         `[${FUD_INLINE_WITHOUT_NONCE}] "${RUNTIME_MARKER}?${INLINE_QUERY}" needs the document ` +
                                     `policy to declare 'nonce-{nonce}', and this one does not ` +
                                     `(${result.inlineRuntime.file} at ${result.inlineRuntime.offset})`
FUD0804  vite runtime-pieces.ts:187  `the package "${label}" declares fudic.runtime "${declared}", and that directory ` +
                                     'does not exist or holds no piece. A package that declares it produces one bundled ' +
                                     'file per piece there in its own build, and this build links those files by URL: run ' +
                                     "the publisher's build, or remove the declaration."
FUD0805  vite runtime-pieces.ts:147  `the packages "${a}" and "${b}" would both publish "${piece.url}". Two packages ` +
                                     'whose names end in the same segment and whose versions are equal claim one file in ' +
                                     'the output, and whichever is copied last decides what every page that names it ' +
                                     'receives: rename one of them, or keep only one in the dependency graph.'
FUD0806  vite runtime-link.ts:429    `the piece "${piece.url}" carries this build's token. A published piece is the ` +
                                     'same bytes for every application and every deploy, so it cannot hold a fact of ' +
                                     'one of them: something that belongs to the application was compiled into code ' +
                                     `that belongs to the framework, in "${piece.pkg}".`
FUD0820  snippet/parser.ts:200       text === '' ? `${label} expects a name`
                                     : `"${text}" is not a valid snippet name: letters, digits and underscore, never a hyphen`
FUD0821  snippet/parser.ts:219       `${label} requires parentheses`
FUD0822  snippet/body-rules.ts:49    'a @snippet has no <style>: it contributes no CSS and takes no part in the cascade of the head it expands into'
FUD0823  snippet/body-rules.ts:40    'a @snippet has no @code: it has no state of its own, and every value in its markup arrives as an argument'
         structure.ts:524            'a file of snippets has no @code: a snippet has no state of its own and nothing here would run it'
FUD0824  structure.ts:272            '@snippet is a top-level node of the file: nested, it declares nothing'
FUD0825  snippet/body-rules.ts:55    'a @snippet has no <head>: it is markup, not a document'
FUD0826  expand/check.ts:99          `no snippet called "${call.name}" is in scope: declare it here, or import the file that does with <link rel="snippet">`
         expand/check.ts:121         `"${call.namespace.name}" declares no snippet called "${call.name}"`
FUD0827  expand/check.ts:110         `no <link rel="snippet" as="${call.namespace.name}"> in this file: "as" is the only thing that declares a namespace, and it is never inferred`
FUD0828  expand/check.ts:218         `@render ${call.name} is missing "${param.name === '' ? `argument ${index + 1}` : param.name}", which has no default`
FUD0829  expand/check.ts:154         `@render ${call.name} takes ${params.length} argument${params.length === 1 ? '' : 's'}`
FUD0830  expand/check.ts:168         `"${arg.name}" is not a parameter of @snippet ${call.name}`
FUD0831  expand/check.ts:179         `"${arg.name}" is given twice`
                                     related: [{ span: taken.value.span, message: 'it already arrived by position here' }]
FUD0832  snippet/parser.ts:279       'a positional argument cannot follow a named one: positionals first, names after'
FUD0834  structure.ts:251            `this file declares two snippets called "${snippet.name}"`
                                     related: [{ span: first.nameSpan, message: `"${snippet.name}" is already declared here` }]
         expand/scope.ts:282         `two snippets are called "${name}" in this file's scope: ${first.file} and ${second.file}. Give one of the two imports an "as" to put it under a namespace`
                                     related: firstLink === undefined
                                       ? { span: first.decl.nameSpan, message: `"${name}" is declared here`, file: first.file }
                                       : { span: firstLink.span, message: `"${name}" came in through this import` }
FUD0835  expand/check.ts:253         `a snippet cannot expand into itself: ${names.join(' → ')}`
FUD0836  expand/scope.ts:233         '<link rel="snippet"> requires a static href'
         expand/scope.ts:242         `<link rel="snippet"> does not resolve: no file for "${href}"`
         expand/scope.ts:252         `${file.path} declares no @snippet: nothing is imported from it`
FUD0850  css/flatten.ts:438          'this @import names a file the build cannot read: it stays, and what it imports arrives whole, without pruning'
FUD0851  css/rules.ts:107 (#fail)    :115 'this stylesheet has a comment that never ends: it is shipped whole, without pruning'
                                     :134 'this stylesheet has a string that never ends: it is shipped whole, without pruning'
                                     :183 'this stylesheet has a "{" that never closes: it is shipped whole, without pruning'
FUD0852  vite plugin.ts:1711         `[${FUD_SHEET_UNUSED}] ${sheet} adds no rule to any page of the application: ` +
                                     'nothing any page renders matches it. It is dead CSS — if a sheet imports it, that @import can go.'
FUD0853  css/flatten.ts:334          `the file this @import names (${imp.url}) does not exist or cannot be read: it is dropped`
FUD0854  emit/prune.ts:523           'a sheet of globalStyles or styles is adopted, and an adopted sheet does not take @import: it is dropped. Import it from a stylesheet a layout links, or list the file in fudic.json'
FUD0855  structure.ts:624            'a component <style> takes no @import: its sheet is adopted, and an adopted sheet ignores it. Choose the sheet in fudic.json "styles" instead'
FUD0856  css/flatten.ts:325          `this @import closes a cycle (${imp.url}): it is dropped`
FUD0857  css/flatten.ts:351          'this @import comes after a rule, and the browser ignores it: it is dropped'
FUD0858  css/flatten.ts:447          'this @import is moved to the top of the flattened sheet, ahead of rules that came before it: the cascade order changes'
```

### 2c. How the vite plugin reports each non-compiler list (severity source)

- `buildStart` (`vite/src/plugin.ts:741-805`): `project.warnings` (config FUD0720) → warn;
  `project.errors` (FUD0721-config) → error; `styleErrors` (FUD0740, FUD0741, FUD0854 relocated)
  → error; `styleChains.diagnostics` (FUD0741 vite, + library styleErrors) → error;
  `runtimePieces` (FUD0804, FUD0805) → error; `checkPeers` (FUD0800) → error; `styleWarnings`
  (FUD0743 relocated) → warn; `discoverRoutes` (FUD0360, 0361, 0364, 0393, 0394, 0397, 0398,
  0434) → warn; `checkLinks` (FUD0760, 0763) → error.
- `transform` (`:1191-1196`): compiler diagnostics by `d.severity`, message
  `[${d.code}] ${d.message} (${d.file ?? path})`.
- `generateBundle`: rename (FUD0500, 0501) → warn (:1434); piece copy (FUD0806 → error, FUD0802
  → warn, :1561); manifest (FUD0392, 0396) → warn (:1622); sheet diagnostics (FUD085x) by
  severity (:1705); FUD0852 warn; FUD0391 warn.

---

## 3. Retired / burned / reserved (not emitted)

| Code | What it was | Retired by | Replaced by | Source |
|---|---|---|---|---|
| FUD0050 | Close tag does not match top-of-stack element | Reserved, never implemented (recovery-to-ancestor chosen) | FUD0052 / FUD0051 in practice | SDD-05 §(catálogo) note; SDD-12 §5 still lists it |
| FUD0090 | Property value must be a lone `@` | BUG-16 | — (constant accepted; dot is the only prop syntax) | `compiler/src/binding/classify.ts:40` comment; SDD-12 §5 still lists it as defined |
| FUD0112, FUD0113 | Strategy whitelist / strategy parentheses (decisions 63–65) | Burned with decisions 63–65 (SDD-08, BUG-13) | — | SDD-08 §5, SDD-12 §5, `code/code.ts:32` |
| FUD0130 | Razor construct (control/@code/raw) not allowed in `<style>` | Not formally retired; obsolete since decision 136 (SDD-49): any Razor in `<style>` is FUD0132 | FUD0132 | SDD-09 §, SDD-12 §5 (still "defined"); no source emits it |
| FUD0292 | State prop not JSON-serializable | Reserved, never implemented (type check, SDD-24) | TypeScript | SDD-12 §5, SDD-15-Task-mapas §510 |
| FUD0293 | Gap in the `tag → chunk` manifest | SDD-15 (§3.6 map removed) | — | SDD-15 catalog, SDD-12 §5 ("quemado") |
| FUD0422 | Cycle in the layout chain | BUG-38 (no more layout chains) | — | SDD-21 catalog; `emit/resolve.ts:33` |
| FUD0437 | A layout has no `@code` block | SDD-40 §3.1 | FUD0700 (narrower) | SDD-21 catalog; `document/structure.ts:112`; decision 89 |
| FUD0603, FUD0604 | Compiler chose the bridge field (decision 132, original) | BUG-42 (amendment of §3.4 / decision 132) | FUD0605 (author writes the bridge) | SDD-34 catalog, BUG-42, SDD-12 §5 |
| FUD0703 | Two layouts of one chain declare the same prop with incompatible types | BUG-38 | — | SDD-40 catalog; `emit/layout-code.ts:33` |
| FUD0704 | Layout prop read in the `<body>` | SDD-48 §4.1 (decision 133) | — | SDD-40/SDD-48 catalogs; `layout-body.ts:16` |
| FUD0706 | `@` inside a `<style>` of a layout | Decision 136 (SDD-49) | FUD0132 | SDD-49 §4.12; `layout-body.ts:13`, `emit/layout-code.ts:126` (SDD-12 §5 still lists it as defined) |
| FUD0722 | "Tag does not carry the project prefix" (two drafts) | RESERVED AND DELIBERATELY UNUSED (SDD-41) | FUD0761 covers what breaks | `config/src/diagnostics.ts:37` |
| FUD0762 | Library `@fudic/compiler` peer range excludes resolved compiler (warning) | SUPERSEDED by SDD-45 §4.8 — constant kept (`vite/src/diagnostics.ts:106`), never emitted | FUD0800 (error) | SDD-43 catalog, SDD-45 |
| FUD0786 | `fudic g lib` without `--prefix` | RESERVED AND DELIBERATELY UNUSED (SDD-44) | — | `cli/src/diagnostics.ts:40`, SDD-44 catalog |
| FUD0833 | `@` inside the header of a `@render` (decision 13) | SDD-48 §4.7 (decision 135) | FUD0444 / FUD0445 (compiler meanings) | SDD-29 catalog; `snippet/parser.ts:42` |
| FUD0197, FUD0198, FUD0199 | Required prop missing / unknown `.prop` / undeclared slot | SDD-35 §4.7 says "retirados por este SDD" — **SDD-35 task 13 still `[ ]`; all three are STILL EMITTED** | TypeScript over the projection | SDD-35, SDD-35-Task:70, SDD-50 §(line 406) |

Partial retirement (not a whole code): the `FUD0011` case inside `<style>` (unterminated Razor
comment) is now FUD0132 (SDD-49 §4.12). `FUD0391` used to be declared-unused (BUG-01) and is
now emitted.

### Declared constants never emitted (not documented as retired)

| Code | Constant | Where | Documented meaning |
|---|---|---|---|
| FUD0395 | `FUD_UNLINKABLE_CONSTRUCT` | `vite/src/diagnostics.ts:40` (re-exported `vite/src/index.ts:29`) | SDD-20: construct unsupported by linkable format (`import()`, TLA), error |
| FUD0723 | `FUD_CONFIG_LIB_WITH_DEPLOYMENT` | `config/src/diagnostics.ts:44` (re-exported `config/src/index.ts:19`) | SDD-41: `kind: "lib"` with `sw.json` or non-empty routes dir, error |

### Constructed but never reported

- FUD0365 — `vite/src/options.ts:65`; `plugin.ts:499` reads only `.options`.
- FUD0390 (×3) and FUD0392 (swconfig site) — `vite/src/swconfig.ts:96/104/113/122`;
  `plugin.ts:504` reads only `.config`.

### Reserved ranges stated in code comments

`FUD0462`–`0479` (language-server), `FUD0483`–`0499` (formatter), `FUD0446`–`0449` (SDD-21/48
say reserved — but CLI uses them), `FUD0520`–`0539` (SDD-28, empty), `0544`–`0569`,
`0571`–`0589`, `0606`–`0619`, `0623`–`0639`, `0668`–`0679`, `0685`–`0699`, `0707`–`0719`,
`0837`–`0849`, `0859`–`0869`.

---

## 4. Code-keyed lookups / code-typed seams (must migrate too)

| Where | What |
|---|---|
| `language-server/src/services/actions.ts:405-411` | `REPAIRS: Map<string, Repairer>` keyed `'FUD0444'` (addArgumentAt), `'FUD0056'` (quoteValue), `'FUD0191'` (addComponentLink), `'FUD0440'` (addRequiredSections), `'FUD0540'` (addLoopKey); looked up at `:579` `REPAIRS.get(diagnostic.code)`. 0440/0444 mean the COMPILER codes (collision with CLI). |
| `formatter/src/format.ts:52` | `KEY_RULES = new Set(['FUD0540','FUD0541','FUD0542'])`; used `:58` `html.diagnostics.filter((d) => !KEY_RULES.has(d.code))` |
| `cli/src/run.ts:31` | `BROKEN_SOURCE = new Set([FUD_WIRE_TARGET_BROKEN, FUD_FORMAT_UNPARSEABLE])` (0445-cli, 0450); used `:88` `plan.errors.some((error) => BROKEN_SOURCE.has(error.code)) ? 2 : 1` (exit code) |
| `vite/src/plugin.ts:1561` | `if (d.code === FUD_RUNTIME_PIECE_HAS_BUILD) this.error(...) else this.warn(...)` — severity chosen by code (FUD0806 vs FUD0802) |
| `cli/src/workspace/target.ts:93` | passthrough `cliError(entry.code, entry.message, entry.file)` of config diagnostics (FUD0720) |
| `vite/src/styles.ts:270` | passthrough `code: d.code` relocating compiler FUD0743/FUD0854 into `ConfigDiagnostic` |
| `compiler/src/binding/bridge.ts:35` | type `BridgeProblem.code: 'FUD0605'` (literal type) |
| `compiler/src/binding/markers.ts:53` | type `MarkerProblem.code: 'FUD0597' \| 'FUD0598' \| 'FUD0599' \| 'FUD0600' \| 'FUD0601' \| 'FUD0602'`; `fail(code: MarkerProblem['code'], …)` at :118 |
| `compiler/src/binding/adopt.ts:35` | type `code: typeof FUD_ADOPTED_STYLE_DYNAMIC` |
| `compiler/src/snippet/body-rules.ts:31-34` | `Rule { code: string; message }` table → `errorDiag(rule.code, …)` at :70 |
| `compiler/src/semantic/analyzers/error-marker.ts:37`, `form-associated-placement.ts:55, :60` | re-wrap `problem.code` into `errorDiag` |
| `vite/src/diagnostics.ts:203` | `export { FUD_SHEET_UNUSED } from '@fudic/compiler'` (cross-package constant) |
| Public re-exports of code constants | `compiler/src/binding/index.ts:62-63` (0745, 0744), `compiler/src/css/index.ts:24-28` (0850, 0853, 0856-0858), `compiler/src/emit/index.ts:129-132` (0851, 0852, 0854, 0855), `config/src/index.ts:17-22` (0720, 0721, 0723, 0724, 0740, 0741), `formatter/src/index.ts:23-28`, `language-server/src/index.ts:30-31`, `vite/src/index.ts` (16 constants incl. 0395) |
| Cross-package constant use | cli imports `FUD_CONFIG_MALFORMED`/`FUD_CONFIG_DUPLICATE_ID` from `@fudic/config`; vite imports `FUD_CONFIG_ID_REQUIRED`, `FUD_STYLE_SPECIFIER_CLASH` from config and `FUD_ADOPTED_STYLE_UNKNOWN`, `FUD_SHEET_UNUSED` from compiler; language-server imports `FUD_ADOPTED_STYLE_UNKNOWN` from compiler |

Not FUD-keyed (ignore): `language-core/src/mapping.ts:72` dedupe key `${d.sourceOffset}:${d.code}`
(TS checker codes). Tests: 171 files under `packages/*/test` mention `FUDnnnn` literals.
