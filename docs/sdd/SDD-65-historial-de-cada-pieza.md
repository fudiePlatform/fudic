# SDD-65 — El historial de cada pieza: aprobaciones y ejecuciones en git

> **Estado:** `Listo` — [tareas](./SDD-65-Task.md).
> **Paquetes:** `@fudic/history` (nuevo) · `@fudic/cli` · `@fudic/diagnostics` ·
> `@fudic/conventions`
> **Depende de:** 64 (los informes de criterios y tests), 63 (el contrato, para saber qué está
> documentado), 52 y 53 (`.fudspec` y fixtures), 22 y 44 (la CLI)
> **Rango de diagnósticos:** `FUD1220`–`FUD1239` (nuevo). Usa `FUD1220`–`FUD1222`.
> **Decisiones de gramática:** ninguna.
> **Origen:** [IDEA-07](./ideas/IDEA-07-mcp-de-fudic.md) §5.8, §10.2, §10.5, §10.6 y §11.2 (trabajo 4).
> **Rama sugerida:** `sdd-65-historial-de-cada-pieza`
>
> **Qué añade en una frase.** Junto a cada componente y cada ruta vive un fichero `.fudlog` que
> solo crece: quién aprobó sus criterios, cada ejecución de tests y criterios con su resultado, lo
> que aceptó el cliente; cada línea lleva el hash de lo que entró, así que se sabe si una
> aprobación o un verde siguen valiendo.

---

## 1. Contexto y objetivo

El MCP (IDEA-07) guía al LLM por fases: primero el usuario aprueba los criterios, después los tests
quedan en rojo, después la vista hasta el verde. Para eso tiene que poder contestar, mirando solo
el repositorio:

1. **¿Aprobó alguien estos criterios?** ¿Y siguen siendo los que aprobó, o los ha tocado el LLM
   después?
2. **¿Los tests pasan con el código de ahora**, o el último verde es de antes de un cambio?
3. **¿Qué aceptó el cliente**, y en qué commit?

Hoy no hay dónde mirar. Las ejecuciones viven en memoria del banco y se pierden al cerrarlo
(SDD-64 deja el último informe en `.fudic/runs/`, que no va a git). Una aprobación dicha en el chat
no queda en ningún sitio. Y un equipo no puede ver qué pasó de verdad con una pieza.

Pedro decidió (IDEA-07 §5.7, §5.8) que esto **va a git**, en un fichero por pieza, y que la
aprobación **vive solo ahí**: una línea con quién, cuándo y el hash de lo aprobado. Si el hash de
ahora es otro, la aprobación caducó.

### 1.1. Cómo se ve

`src/components/acme-button/acme-button.fudlog`:

```
2026-10-22T10:02Z a1b2c3d started     by agent  "Button for the current page's actions"
2026-10-22T10:20Z d4e5f6a approved    by pedro  spec 4 hash 2b8f3c91aa04
2026-10-22T10:31Z 0a9b8c7 tests       red 0/6  hash 91c2e7d40b18
2026-10-22T10:33Z 0a9b8c7 spec_run    fail 0/4  hash 91c2e7d40b18
2026-10-22T10:48Z 7f6e5d4 spec_run    fail 3/4  hash 4471a0c2be6d  disabled-no-press
2026-10-22T10:52Z 3c2b1a0 spec_run    pass 4/4  hash 5e7a90c3d211
2026-10-22T10:52Z 3c2b1a0 tests       pass 6/6  hash 5e7a90c3d211
2026-10-22T11:06Z 9d8c7b6 done
```

Cada línea dice lo que pasó, quién lo hizo, en qué commit estaba el repositorio y, si depende de
ficheros, el hash de esos ficheros.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 64 | `runSpecs` y `runTests` con su informe (`CriterionReport`, `TestReport`). |
| 63 | El contrato del componente, con la doc de cada prop. |
| 52, 53 | La `.fudspec` y su fixture, que es lo que se aprueba. |
| 22, 44 | La CLI con planes (`Plan`, `apply`, `PlanCommand`). |

## 3. Interfaz pública

### 3.1. El fichero

- **Dónde.** Junto al `.fud` de la pieza, con su mismo nombre: `acme-button.fud` →
  `acme-button.fudlog`; `routes/blog/index.fud` → `routes/blog/index.fudlog`. Una pieza es un
  componente o una ruta. `HISTORY_EXTENSION = '.fudlog'` en `@fudic/conventions`.
- **Solo crece.** Nadie reescribe ni borra una línea. Las herramientas solo añaden al final.
- **Va a git.** `fudic new` (las dos formas) escribe un `.gitattributes` con
  `*.fudlog merge=union`: dos ramas que añaden líneas a la vez se juntan sin conflicto.

### 3.2. Una línea

```
<instante> <commit> <suceso> <campos…>
```

- `<instante>`: UTC al minuto, `2026-10-22T10:02Z`.
- `<commit>`: los siete primeros caracteres del `HEAD` al escribir la línea; `-------` fuera de git
  o sin commits.
- `<suceso>` y sus campos, separados por uno o más espacios. Un texto libre va entre comillas
  dobles, con las reglas de escape de JSON. Un `<hash>` son los doce primeros caracteres
  hexadecimales del SHA-256 de §4.2.

| Suceso | Campos | Qué es |
|---|---|---|
| `started` | `by <quién> "<para qué>"` | La pieza empieza |
| `approved` | `by <quién> spec <criterios> hash <hash>` | Alguien aprobó props y criterios (§4.2: hash de aprobación) |
| `tests` | `<veredicto> <pasan>/<total> hash <hash>` | Una ejecución de los tests unitarios de la pieza |
| `spec_run` | `<veredicto> <pasan>/<total> hash <hash> [<id>…]` | Una ejecución de sus criterios; los `id` que no pasaron |
| `documented` | `<con doc>/<props>` | Se documentó: cuántas props tienen JSDoc |
| `look` | `by <quién> hash <hash>` | Alguien aprobó el aspecto (el hash de las capturas) |
| `reopened` | `by <quién> "<qué se pidió>"` | Una pieza terminada vuelve a empezar |
| `done` | — | La pieza está terminada |
| `accepted` | `by <quién> "<qué dijo>" tag <etiqueta>` | El cliente lo aceptó; la etiqueta de git sobre ese commit |
| `connected` | `<función>…` | Funciones que pasan de falsas a conectadas al backend |

- **Veredictos.** `tests`: `pass` (todos pasan), `red` (alguno falla y ninguno está roto),
  `broken` (alguno no llegó a comprobar). `spec_run`: `pass`, `fail` (alguno falla y ninguno da
  error), `error`. **`<pasan>/<total>` cuenta siempre los que pasan**: `red 0/6` es el rojo entero
  de la fase 3; `red 6/8`, dos tests nuevos en rojo sobre seis viejos en verde.
- **`<quién>`**: `agent` cuando escribe una herramienta en nombre de un LLM; el nombre de la
  persona (`git config user.name`, sin espacios: se cambian por `-`) cuando actúa ella.

### 3.3. La API

```ts
// @fudic/history
export type HistoryEvent =
  | { kind: 'started'; by: string; text: string }
  | { kind: 'approved'; by: string; criteria: number; hash: string }
  | { kind: 'tests'; verdict: 'pass' | 'red' | 'broken'; passed: number; total: number; hash: string }
  | { kind: 'spec_run'; verdict: 'pass' | 'fail' | 'error'; passed: number; total: number; hash: string; failing: readonly string[] }
  | { kind: 'documented'; documented: number; props: number }
  | { kind: 'look'; by: string; hash: string }
  | { kind: 'reopened'; by: string; text: string }
  | { kind: 'done' }
  | { kind: 'accepted'; by: string; text: string; tag: string }
  | { kind: 'connected'; functions: readonly string[] };

export interface HistoryLine {
  readonly at: string;          // '2026-10-22T10:02Z'
  readonly commit: string;      // 7 chars or '-------'
  readonly event: HistoryEvent;
  readonly span: Span;          // the line in the .fudlog
}

/** Never throws: a line it cannot read is a FUD1220 and is skipped. Lines come sorted by instant (stable). */
export function parseHistory(text: string, file?: string): ParseResult<readonly HistoryLine[]>;
export function formatLine(line: Omit<HistoryLine, 'span'>): string;

/** Appends one line to the unit's .fudlog, creating it when it does not exist. */
export function record(unit: string, event: HistoryEvent, io?: HistoryIo): Promise<void>;

/** The hashes of §4.2, from the files as they are now. */
export function approvalHash(unit: string, io?: HistoryIo): Promise<string>;
export function inputsHash(unit: string, io?: HistoryIo): Promise<string>;

/** What the history and the files say about a unit, now. */
export function unitState(unit: string, io?: HistoryIo): Promise<UnitState>;

export interface UnitState {
  readonly unit: string;                         // the .fud, relative to the project root
  readonly lines: readonly HistoryLine[];
  readonly diagnostics: readonly Diagnostic[];
  readonly approval: 'none' | 'valid' | 'expired';
  readonly approvedAt?: string;                  // the commit of the last `approved`
  readonly tests: RunState;
  readonly spec: RunState;
  readonly look: 'none' | 'valid' | 'expired';
  readonly done: boolean;                        // the last of done/reopened is done
  readonly accepted?: { readonly tag: string; readonly commit: string };
}

export type RunState =
  | { readonly state: 'not run' }
  | { readonly state: 'stale'; readonly last: string }       // the hash changed since; last = its verdict
  | { readonly state: 'pass' | 'red' | 'broken' | 'fail' | 'error'; readonly passed: number; readonly total: number };
```

### 3.4. Grabar las ejecuciones

```ts
// @fudic/history
/** The input hashes of these units, taken before a run: what is about to be tested. */
export function snapshot(units: readonly string[], io?: HistoryIo): Promise<Snapshot>;

/** One `spec_run` line per .fudspec in the summary, with the hashes of the snapshot. */
export function recordSpecRun(summary: { readonly reports: readonly CriterionReport[] }, before: Snapshot, io?: HistoryIo): Promise<void>;
/** One `tests` line per unit whose sibling tests ran. */
export function recordTestRun(report: TestReport, before: Snapshot, io?: HistoryIo): Promise<void>;
```

Quien quiere grabar (el MCP, un script del equipo) hace tres pasos: `snapshot`, ejecutar con
`runSpecs` o `runTests` (SDD-64), y `recordSpecRun` o `recordTestRun` con el informe. El banco y
`@fudic/testing` no saben nada del historial, y el banco abierto en el editor, que ejecuta en cada
guardado, no lo llena de ruido.

### 3.5. La CLI

```
fudic approve <pieza>            # approved, con la persona de git y el hash de ahora
fudic accept  <pieza> "<texto>"  # accepted y la etiqueta de git accepted/<nombre>/<fecha>
fudic history <pieza>            # lo que dice unitState, para una persona
```

`<pieza>` es el `.fud` o su carpeta. Son planes como todos los de la CLI: `accept` lleva la
etiqueta como un `PlanCommand` (`git tag`), y `--dry-run` y `--json` funcionan igual.

### 3.6. Los códigos

| Código | Severidad | Título (`.md`) | Cuándo |
|---|---|---|---|
| `FUD1220` | warning | A history line that cannot be read | Una línea del `.fudlog` no sigue §3.2: se salta y el resto se lee |
| `FUD1221` | error | Not a component or a route | `approve`, `accept` o `history` sobre algo que no es una pieza |
| `FUD1222` | error | Nothing to approve | `approve` sobre una pieza sin `.fudspec` |

**Fix:** `1220`: «the line was written by hand or cut by a merge: restore it from git (`git log -p`)»;
`1221`: «name a component's or a route's `.fud`, or its folder»; `1222`: «write its criteria first:
`fudic g spec <name>`».

## 4. Comportamiento

### 4.1. Leer

- `parseHistory` lee línea a línea; una línea vacía se ignora. Una línea que no se entiende es un
  `FUD1220` con su `span`, y la lectura sigue: un merge mal hecho no deja la pieza sin historia.
- Las líneas se ordenan por instante, estable: con `merge=union`, los bloques de dos ramas pueden
  quedar uno tras otro y no intercalados.

### 4.2. Los hashes

Un hash es el SHA-256 de la lista de ficheros de entrada, ordenada por ruta (relativa a la raíz
del proyecto, con `/`), escribiendo por cada uno su ruta, un salto, su contenido con fines de línea
`LF`, y un salto.

- **Hash de aprobación**: la `.fudspec` de la pieza y su fixture. Es lo que el usuario aprueba
  (props y criterios: las fixtures fijan las props, IDEA-07 §10.2).
- **Hash de entrada** (`tests`, `spec_run`): todo lo que puede cambiar un resultado:
  - los hermanos de la pieza: `.fud`, `.fudspec`, `.fixture.ts`, `.test.ts`, `.fudapi`;
  - cada `.fud` que enlaza con `<link rel="component">`, transitivamente, con sus `.fudapi`;
  - cada módulo del proyecto que importan (`import … from './…'`) el `.fud`, su `@code` o su test,
    transitivamente;
  - no `node_modules` ni lo de una librería publicada: cambia con la versión, y el lockfile no es
    de la pieza. Sí los ficheros de una librería del workspace, que se resuelven como los del
    proyecto.

  Los enlaces se resuelven con `FudIndex` (`@fudic/typecheck`), el mismo que usan el editor y el
  build; los imports, con el parser del compilador.

### 4.3. A qué pieza va cada ejecución

- **`spec_run`**: una línea por cada `.fudspec` ejecutada, en el `.fudlog` de su componente, con
  los criterios que se ejecutaron. Si `failing` limitó la ejecución, la línea cuenta solo esos.
- **`tests`**: una línea por pieza, juntando los recuentos por fichero (`TestReport.files`, SDD-64)
  de los `.test.ts` hermanos de su `.fud`. Un test que no es hermano de ningún `.fud`
  (`src/services/*.test.ts`) no va a ningún historial.
- El hash es el del `snapshot`, tomado **antes de ejecutar**: lo que se probó, aunque alguien
  guarde un fichero mientras corre.

### 4.4. El estado de una pieza

- **`approval`**: `none` sin línea `approved` desde el último `reopened`; `valid` si el hash de
  aprobación de ahora es el de la última `approved`; `expired` si no.
- **`tests` y `spec`**: la última línea de su clase. `not run` si no hay; `stale` si su hash no es
  el hash de entrada de ahora; si no, su veredicto con sus números.
- **`look`**: como `approval`, con el hash de las capturas que dé quien escribió la línea (la
  spec del MCP las adjunta al PR).
- **`done`**: la última de `done` y `reopened` es `done`.
- **`accepted`**: la última `accepted`, con su etiqueta y su commit.
- `unitState` **no decide la fase** ni el siguiente paso: da los hechos. Ordenar las fases es de la
  spec del MCP, que añade lo que no está en el historial (si hay `.fudapi`, si cada función está
  conectada).

### 4.5. La CLI

- **`fudic approve`.** Exige `.fudspec` (`FUD1222`). Escribe `approved` con la persona de
  `git config user.name` (sin git, el usuario del sistema), el número de criterios y el hash de
  aprobación. No pregunta nada: aprobar es el acto de quien lo ejecuta.
- **`fudic accept`.** Escribe `accepted` y crea la etiqueta `accepted/<nombre>/<AAAA-MM-DD>` sobre
  `HEAD`; si ya existe ese día, `-2`, `-3`… El texto es obligatorio.
- **`fudic history`.** Imprime el estado en unas líneas:

  ```
  acme-button  approved by pedro (valid) · tests pass 6/6 · spec pass 4/4 · done
  ```

  Con `--json`, el `UnitState` entero.

## 5. Invariantes

- **Solo se añade.** Ninguna función reescribe una línea; un test compara el fichero antes y
  después de cada escritura.
- **Nada lanza.** Leer un `.fudlog` roto da lo que se pudo leer y sus `FUD1220`.
- **Determinista.** El mismo repositorio da el mismo `unitState`; el hash no depende del sistema
  operativo (fines de línea normalizados, rutas con `/`).
- **Paquete nuevo al 100 %** en las cuatro métricas desde el primer commit.

## 6. Criterios de aceptación

**El fichero**

1. **Ida y vuelta.** Cada suceso de la tabla de §3.2 se escribe con `formatLine` y se lee con
   `parseHistory` igual, incluidos textos con comillas y saltos escapados.
2. **Línea rota.** Una línea `2026-10-22T10:02Z abc garbage` da un `FUD1220` en su línea y el resto
   se lee.
3. **Merge.** Dos ramas que añaden líneas al mismo `.fudlog` se mezclan con `git merge` sin
   conflicto (test con un repositorio git temporal y el `.gitattributes` generado), y
   `parseHistory` las da ordenadas por instante.

**Los hashes**

4. Cambiar un criterio de la `.fudspec` cambia el hash de aprobación; cambiar el `.fud` no.
5. Cambiar el `.fud`, un componente que enlaza, el `.fudapi` o un módulo que importa su `@code`
   cambia el hash de entrada; cambiar otro componente que no enlaza, no.
6. El mismo contenido con `CRLF` y con `LF` da el mismo hash.

**El estado**

7. **Aprobación que caduca.** Tras `fudic approve`, `unitState` dice `approval: 'valid'`; al tocar
   un criterio, `expired`; tras un `reopened`, `none`.
8. **Verde que caduca.** `snapshot`, `runTests` con todo en verde y `recordTestRun` dejan `tests`
   en `pass 6/6`; al tocar el `.fud`, `stale`.
9. **El rojo de la fase 3.** Seis tests nuevos que fallan por una aserción graban `tests red 0/6`;
   uno que no carga graba `broken`.
10. **`spec_run`.** `recordSpecRun` tras un `runSpecs` con un criterio en rojo graba `fail 3/4` con
    su `id`.
11. **El hash es el de antes.** Un fichero que cambia entre `snapshot` y `recordTestRun` no cambia
    la línea grabada, y el estado sale `stale`.

**La CLI**

12. `fudic approve src/components/acme-button` escribe la línea con la persona de git; sin
    `.fudspec`, `FUD1222`; sobre un `.css`, `FUD1221`.
13. `fudic accept … "Client accepted it"` escribe la línea y crea la etiqueta; un segundo `accept`
    el mismo día crea `-2`. Con `--dry-run`, el plan sin escribir ni etiquetar.
14. `fudic history` imprime la línea de §4.5; con `--json`, el `UnitState`.
15. `fudic new` y `fudic new --workspace` escriben `.gitattributes` con `*.fudlog merge=union`.

**Entrega**

16. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `@fudic/history` al 100 % en las cuatro
    métricas y lo nuevo de los demás paquetes también.

## 7. Fuera de alcance

- **Qué fase toca y qué hacer después** (`fudic_status` y su `next`): la spec del MCP.
- **Escribir `started`, `documented`, `look`, `done`, `reopened` y `connected`**: lo hace el MCP
  en su flujo con `record`. Aquí están el formato, la lectura y la grabación de ejecuciones.
- **Las capturas de aspecto** y su adjunto al PR: la spec del MCP.
- **Pintar el historial** en el banco o en el editor.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Un paquete nuevo, `@fudic/history`.** Lo usan la CLI y el MCP. Lee los informes del banco y de
   `@fudic/testing` (solo sus tipos), pero ninguno de los dos depende de él.
2. **`<pasan>/<total>` siempre.** IDEA-07 mezclaba «rojos de total» y «pasan de total»; una sola
   lectura evita errores al leerlo.
3. **UTC al minuto.** Basta para ordenar sucesos de una persona o un agente, y no depende de la
   zona de quien escribe.
4. **Grabar es un paso aparte (`snapshot` → ejecutar → `record…Run`).** El banco abierto ejecuta en
   cada guardado; si grabase solo, llenaría el historial de ruido, y además tendría que depender de
   este paquete. El MCP graba; un equipo puede grabar desde un script con la misma API.
5. **El hash de entrada no incluye dependencias publicadas.** Cambian con el lockfile, que no es de
   la pieza; incluirlas haría caducar todos los verdes al actualizar cualquier paquete.
6. **`unitState` da hechos, no fases.** Las fases necesitan saber cosas que no están en el
   historial (el `.fudapi`, las funciones conectadas); mezclarlo aquí ataría este paquete a la API.
