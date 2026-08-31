# SDD-35 — `fudic check`: los tipos del template, sin editor

> **Estado:** `Listo`
> **Paquetes:** `@fudic/cli` (el comando, el reporte y los códigos de salida) ·
> `@fudic/language-core` (la proyección y la tabla de mappings, que ya existen y **no cambian**)
> · `@fudic/compiler` (el parser y el pase semántico, que ya existen y **no cambian**)
> **Depende de:** 22 (la CLI y su API de planes), 23 (la proyección TS y `GLOBALS_DTS`),
> 12 (los diagnósticos del pase semántico), 24 (de quien se copia el reparto, no el código)
> **Rango de diagnósticos:** `FUD0620`–`FUD0639`
> **Decisiones de gramática:** ninguna nueva
> **Naturaleza:** ensamblaje. Todas las piezas existen; lo que falta es montarlas fuera del
> editor y mapear el resultado de vuelta.

---

## 1. Contexto y objetivo

Hoy fudic tiene **dos compiladores que no se hablan**. `pnpm build` corre el parser, el pase
semántico y el emit; comprueba la gramática, la forma del documento y el contrato sintáctico entre
componentes. Lo que **no** hace es pasar TypeScript por los ficheros virtuales de
`@fudic/language-core`. Toda la máquina de tipos del template —`$props`, `$attrs`, `$on`,
`$intoSlot`, `$section`, `$gap`— vive **solo dentro de VS Code**.

La consecuencia se mide en una línea:

```html
<app-badge .tone="@(42)"></app-badge>   <!-- tone?: 'neutral' | 'success' | 'info' -->
```

Rojo en el editor. **Verde en CI.** Y el día que alguien toque `props<T>()` de un componente con
seis consumidores, el build sigue verde y el error aparece en producción.

El objetivo de este SDD es un comando —`fudic check`— que monte los mismos ficheros virtuales que
el servidor le da a TypeScript, los pase por un `Program` de verdad, y mapee los diagnósticos de
vuelta al `.fud` con **la misma tabla de mappings**. Es exactamente lo que hacen `vue-tsc` y
`svelte-check`. Aquí la infraestructura está entera desde SDD-23: falta el ensamblaje.

**El efecto que más importa no es encontrar errores, es dejar de tener dos verdades.** Con
`fudic check` en CI, `FUD0197`/`FUD0198`/`FUD0199` —las tres reglas de contrato que BUG-23 metió en
el compilador precisamente porque el build no veía los tipos— pasan a ser un **atajo**: rápido,
sintáctico, sin `tsc`, y ya no la única red.

### Lo que este SDD NO es

- **No es un servidor.** No hay incremental, no hay watch, no hay caché entre invocaciones. Un
  proceso, un `Program`, un reporte, un código de salida. El watch es de SDD-19 (el plugin) y
  vive en el dev server, donde ya hay un grafo que invalidar.
- **No es un formateador ni un linter.** No opina sobre estilo. Lo que reporta son
  diagnósticos del compilador y de TypeScript, ninguno inventado aquí salvo los tres del §5.
- **No cambia la proyección.** Si un tipo no se comprueba bien, eso es un defecto de SDD-23 y se
  arregla allí. Este comando es un consumidor.
- **No sustituye a `tsc`.** El `.ts` normal del proyecto lo comprueba `tsc` como siempre. Este
  comando existe porque los `.fud` **no son ficheros que `tsc` sepa abrir**.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-22 | La CLI: `parseArgs`, la forma de un comando, `Streams`, los códigos de salida, `ReadIo`. `check` entra como un comando más, y **no** produce un `Plan`: no modifica ficheros (§4.6). |
| SDD-23 | `emitVirtualFiles(input): VirtualFile[]`, con su `mappings` y sus `MappingCaps`; `GLOBALS_DTS` y `GLOBALS_FILE_NAME`; `clientFileName` / `serverFileName` / `styleFileName`; `mapToSource`. Todo se consume tal cual. |
| SDD-12 | Los diagnósticos del pase semántico, que este comando reporta junto a los de TypeScript en una sola lista ordenada. |
| SDD-24 | El **reparto**, no el código: qué stretch de la proyección es visible para un diagnóstico lo decide `MappingCaps.verification`, exactamente como en el servidor. Copiar la regla es correcto; copiar la implementación de Volar no lo es. |
| TypeScript 5.9 | `ts.createProgram` con un `CompilerHost` propio. Es dependencia de **runtime** de `@fudic/cli`, declarada como tal. |

---

## 3. Interfaz pública

### 3.1. El comando

```
fudic check [paths...] [--project <tsconfig.json>] [--json] [--no-semantic]
```

| Argumento | Significado |
|---|---|
| `paths...` | Ficheros `.fud` o directorios que los contienen. Por omisión, `.` — la raíz del proyecto. Un directorio se recorre en profundidad, saltando `node_modules` y `dist`. |
| `--project` | El `tsconfig.json` de cuyas `compilerOptions` sale el `Program`. Por omisión, el `tsconfig.json` más cercano hacia arriba desde la raíz de búsqueda. |
| `--json` | El reporte como JSON en `stdout`, para CI. Sin él, texto con la ruta, la línea, la columna, el código y el mensaje. |
| `--no-semantic` | Solo parser y pase semántico: no se monta `Program`. Es el atajo rápido para un hook de pre-commit, y **no** es lo que corre en CI. |

Los flags globales de SDD-22 (`--cwd`, `--force`) se aceptan; `--force` no significa nada aquí y
se ignora, como en `fmt`.

### 3.2. La API, porque el binario es una cáscara

```ts
/** Everything a check needs from the world, so a test needs no disk. */
export interface CheckDeps {
  readonly readIo: ReadIo;
  /** Absolute paths of the `.fud` files under `root`, deepest-first is not required. */
  fudFiles(root: string): readonly string[];
  /** The TypeScript module. Injected so a test can assert without a real program. */
  readonly ts: typeof import('typescript');
}

export interface CheckOptions {
  readonly paths: readonly string[];
  readonly project?: string;
  /** Skip the TypeScript program: parser and semantic pass only. */
  readonly semantic?: boolean;
}

/** One problem, already in `.fud` coordinates. */
export interface CheckProblem {
  /** Absolute path of the `.fud`. */
  readonly file: string;
  readonly span: Span;
  readonly severity: Severity;
  /** `FUD0123` for a compiler diagnostic, `TS2345` for one of TypeScript's. */
  readonly code: string;
  readonly message: string;
  /** Which half produced it. The reporter groups by this. */
  readonly source: 'fudic' | 'typescript';
}

export interface CheckResult {
  readonly problems: readonly CheckProblem[];
  /** How many `.fud` files were read, whether or not they had problems. */
  readonly checked: number;
}

export function check(options: CheckOptions, deps: CheckDeps): Promise<CheckResult>;
```

`CheckProblem` lleva `span`, nunca línea y columna: la conversión es un `LineMap` y ocurre en el
reporte, que es donde un humano lee. Es la regla de oro del repo aplicada a un comando nuevo.

### 3.3. Códigos de salida

| Código | Cuándo |
|---|---|
| `0` | Ningún problema de severidad `error`. Los `warning` se imprimen y **no** cambian el código. |
| `1` | Error de uso: un `--project` que no existe, una ruta que no existe, un flag desconocido. |
| `2` | Al menos un `error`. Es el código que rompe un CI. |

Dos códigos separados para «el comando no pudo correr» y «el comando corrió y encontró errores»,
porque un script tiene que poder distinguirlos. Es el mismo reparto que ya usa `fudic fmt`.

---

## 4. Comportamiento

### 4.1. Un `Program`, no uno por fichero

Se recogen **todos** los `.fud` primero, se proyectan todos, y se monta **un solo**
`ts.Program` con la lista completa de ficheros virtuales. No es una optimización: es la única
forma de que el chequeo sea correcto.

Un `.fud` importa el tipo de otro. `<app-badge .tone="x">` se proyecta contra el `$Props` que
exporta el virtual de `app-badge.fud`, y ese tipo solo existe si el virtual del hijo está en el
mismo `Program`. Comprobar fichero a fichero daría `Cannot find module` en cada consumidor —
mil errores donde no hay ninguno.

### 4.2. El `CompilerHost` sirve tres mundos

| Se pide | Se devuelve |
|---|---|
| `foo.fud.ts`, `foo.fud.server.ts` | El `text` del `VirtualFile` correspondiente, de memoria. |
| `GLOBALS_FILE_NAME` | `GLOBALS_DTS`, como fichero más de la compilación. Es lo que declara `props`, `signal`, `data`, `$props`… y es exactamente lo que `fudic new` ya escribe en el `tsconfig` de un proyecto nuevo. |
| cualquier otra cosa | Delegado al host por defecto: el `.ts` real, el `.d.ts` de un paquete, las libs de TypeScript. |

Los `.css` virtuales **no entran**: no hay CSS que typecheckear. La proyección los emite para el
servicio de CSS del editor y aquí se descartan, lo cual se comprueba.

`compilerOptions` salen del `tsconfig.json` resuelto, con **tres** forzadas, y cada una tiene su
razón:

- `noEmit: true` — un chequeo no escribe.
- `skipLibCheck` se respeta tal cual esté; no se fuerza. Un proyecto que quiere comprobar sus
  `.d.ts` es asunto suyo.
- `allowJs`, `checkJs`, `jsx` y las rutas se respetan tal cual.

Si el `tsconfig` no se encuentra, se usa un conjunto por defecto equivalente al de
`tsconfig.base.json` del propio repo, y se emite `FUD0620` como `warning`: un chequeo con opciones
inventadas puede ser más estricto o más laxo que el proyecto, y callarlo sería mentir sobre lo que
se ha comprobado.

### 4.3. El mapeo de vuelta, y la regla que lo hace honesto

Un diagnóstico de TypeScript llega con un `fileName` virtual y un `[start, length)` en
coordenadas del virtual. Se traduce con `mapToSource`, la misma función que usa el servidor.

**El filtro es `MappingCaps.verification`, y es la mitad del valor de este comando.** Un stretch de
andamiaje —`function $tpl() {`, los `import type` sintéticos, `declare const data`— lo lleva a
`false`, y un diagnóstico que cae ahí **se descarta**. Sin ese filtro, el primer `.fud` con un
`@code` vacío llenaría el reporte de errores sobre código que el autor no escribió y no puede
arreglar.

Tres casos, y los tres importan:

1. **El diagnóstico cae entero dentro de un stretch verificable** → se reporta, con el span
   mapeado a la fuente.
2. **Cae en andamiaje** → se descarta en silencio. No es una pérdida: el andamiaje es correcto por
   construcción, y si no lo fuera sería un defecto de SDD-23, no del `.fud`.
3. **Cae a caballo** —empieza en código de usuario y termina en andamiaje, que es lo que hace un
   error sobre una expresión que la proyección envuelve— → se reporta **acotado al tramo de
   usuario**. Un diagnóstico cuyo final se sale se recorta al final del stretch; nunca se
   extiende hacia texto que el autor no escribió.

Un diagnóstico que no mapea a **ninguna** parte del `.fud` se descarta, y ese descarte se cuenta:
`FUD0621` (`info`) dice cuántos hubo. En un proyecto sano son cero, y un número que crece es la
señal de que la proyección tiene un hueco — que es precisamente el defecto que este comando existe
para hacer visible.

### 4.4. Los diagnósticos del compilador viajan en la misma lista

Un `.fud` que no parsea no llega a TypeScript. Reportar «error de sintaxis» en un comando y
«tipos» en otro obligaría a correr dos, y el segundo mentiría sobre el primero.

Así que `check` corre, por fichero y en este orden:

1. El **parser** (SDD-01–SDD-10). Si hay algún diagnóstico de severidad `error`, el fichero se
   reporta y **no se proyecta**: una proyección de un árbol roto produce errores de TypeScript
   que son consecuencia del primero, y un reporte de cien líneas donde el problema es una llave
   sin cerrar no ayuda a nadie.
2. El **pase semántico** (SDD-12), incluidos `FUD0197`–`FUD0199`. Un `error` aquí **no** detiene la
   proyección: son reglas de contrato, el árbol está sano, y TypeScript tiene cosas útiles que
   decir del resto del fichero.
3. **TypeScript**, sobre lo que quedó.

### 4.5. El orden del reporte es estable

Por ruta de fichero (orden lexicográfico de la ruta POSIX relativa a la raíz), después por offset,
después por código. Sin desempate por código, dos diagnósticos en el mismo offset salen en el
orden en que TypeScript los devolvió, que no es estable entre versiones — y un reporte que cambia
de orden entre ejecuciones no se puede comparar en un CI.

### 4.6. `check` no produce un `Plan`

Los demás comandos de la CLI devuelven un `Plan` porque escriben ficheros, y el `Plan` es lo que
permite `--dry-run`. `check` no escribe nada, así que un plan sería una envoltura vacía. Entra en
`run.ts` como su propia rama, con su propio reporte.

### 4.7. Rendimiento: lo que se promete y lo que no

Se promete **una** invocación de Oxc por fichero, como en todas partes: el batch del parser es el
mismo que ya existe. Se promete **un** `Program`.

No se promete incrementalidad ni un tiempo concreto. En el repo de ejemplo (`examples/basic`, 14
`.fud`) el objetivo es «no se nota»; en un proyecto de mil componentes, `fudic check` cuesta lo que
cuesta `tsc` sobre mil ficheros, porque es eso. `--no-semantic` existe para quien necesite el
atajo.

---

## 5. Invariantes

1. **Una sola tabla de mappings.** El comando usa `mapToSource` de `@fudic/language-core`. Si
   hiciera falta una segunda forma de mapear, es un defecto de SDD-23 y se arregla allí.
2. **El andamiaje es invisible.** Ningún diagnóstico se reporta sobre un stretch cuyo
   `verification` es `false`. Sin excepciones.
3. **El comando nunca lanza.** Un `tsconfig` roto, un `.fud` ilegible, un `Program` que no se
   puede montar: todo es un diagnóstico y un código de salida. Un stack trace de Node en la
   terminal es un fallo de la CLI (SDD-22 §5).
4. **Spans, no líneas.** `CheckProblem` lleva `Span`. La conversión a línea/columna ocurre en el
   reporte y en ningún otro sitio.
5. **Determinismo.** Dos ejecuciones sobre el mismo árbol producen byte a byte el mismo reporte.
6. **Cero acoplamiento con el servidor.** `@fudic/cli` no depende de `@fudic/language-server`. Lo
   que comparten es `@fudic/language-core`, que es donde vive la proyección.

### Catálogo de diagnósticos (`FUD0620`–`FUD0639`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0620` | `warning` | No se encontró `tsconfig.json`; el chequeo usa opciones por defecto y puede no coincidir con el proyecto. |
| `FUD0621` | `info` | *N* diagnósticos de TypeScript no mapearon a ninguna parte de un `.fud` y se descartaron. Cero en un proyecto sano. |
| `FUD0622` | `error` | Un `.fud` de los pedidos no se pudo leer. Es el equivalente del `FUD0451` de `fmt`. |
| `0623`–`0639` | | Reservados. |

Ninguno de los tres lleva span de fuente: son del comando, no del fichero. `FUD0622` nombra la
ruta en el mensaje.

---

## 6. Criterios de aceptación

1. `fudic check` sobre `examples/basic` sale con código `0` y no reporta nada.
2. Un `.fud` con `.tone="@(42)"` contra `tone?: 'neutral' | 'success' | 'info'` reporta **un**
   problema, `source: 'typescript'`, código `TS2345`, y su span cubre exactamente `42` en el
   `.fud` — ni las comillas, ni el `@(`, ni el atributo entero.
3. El mismo fichero pasa `pnpm build` sin error. **Es el criterio que define el SDD**: es el
   hueco que existe hoy.
4. Un `.fud` con un error de sintaxis reporta el diagnóstico del parser y **ningún** `TS`.
5. Un `.fud` con `FUD0197` (prop requerida sin pasar) reporta ese código **y** los `TS` del resto
   del fichero: una regla de contrato no detiene el chequeo de tipos.
6. Un componente cuyo `props<T>()` cambia de tipo produce el error en **cada consumidor**, lo cual
   solo es posible con un único `Program` (§4.1).
7. Ningún diagnóstico cae sobre andamiaje: un `.fud` mínimo —un componente sin `@code`— reporta
   cero problemas, y un `.fud` cuyo `@code` está vacío también.
8. Un diagnóstico a caballo entre usuario y andamiaje se recorta al tramo de usuario, y su span
   nunca termina más allá del final de ese stretch.
9. `--json` produce JSON válido en `stdout` y nada en `stderr`; sin `--json`, el texto lleva
   ruta relativa, línea y columna 1-based, código y mensaje.
10. El orden del reporte es estable: dos ejecuciones dan el mismo texto byte a byte, y el orden es
    por ruta, después offset, después código.
11. `--no-semantic` no monta `Program`: se comprueba inyectando un `ts` que lanza si se le llama.
12. Sin `tsconfig.json` se emite `FUD0620` como `warning` y el código de salida sigue siendo `0`
    si no hay errores.
13. Un `--project` que no existe sale con código `1` y un mensaje de uso, sin stack trace.
14. Un `.fud` ilegible produce `FUD0622` y código `2`.
15. Los `.css` virtuales no entran en el `Program`: se comprueba que el host nunca recibe una
    petición de un `.fud.<n>.css`.
16. `GLOBALS_FILE_NAME` está en la lista de ficheros raíz del `Program`, y un `.fud` que usa
    `props<T>()` sin importarlo no reporta `Cannot find name 'props'`.
17. Un `warning` no cambia el código de salida; un `error` lo pone a `2`.
18. El comando no lanza nunca: con un `readIo` que lanza en cada lectura, `run` devuelve un código
    y escribe un mensaje.
19. `@fudic/cli` nace de este SDD con `typescript` como dependencia de runtime declarada, y sin
    dependencia alguna de `@fudic/language-server`.
20. Cobertura del código nuevo al **100 %** en las cuatro métricas, sin un solo `v8 ignore` que no
    explique por qué su rama es inalcanzable.

---

## 7. Fuera de alcance

- **Watch.** Un `--watch` es un servidor pequeño con invalidación, y el sitio donde eso ya existe
  es el plugin de Vite (SDD-19).
- **Incremental / `tsBuildInfo`.** Sin medir primero, es complejidad especulativa.
- **Comprobar el CSS.** El servicio de CSS del editor lo hace; llevarlo a CI es otro SDD y otra
  discusión (qué es un error de CSS en un proyecto real rara vez es evidente).
- **Autofix.** `check` reporta. Lo que arregla es SDD-36, y lo hace en el editor, donde hay un
  humano mirando.
- **Retirar `FUD0197`–`FUD0199`.** Se quedan. Este SDD los convierte en un atajo, no en un
  duplicado a borrar: un pre-commit sin `tsc` sigue queriéndolos.
