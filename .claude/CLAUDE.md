# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio. Léela antes de tocar código
o specs.

## Qué es este proyecto

**fudic** es un framework de UI construido sobre **Declarative Shadow DOM** (DSD). La
pieza central es un **compilador de ficheros `.fud`**: componentes de fichero único
escritos en una **sintaxis estilo Razor adaptada a JS/TS** que compilan a salida basada
en estándares (nivel 1 = HTML con DSD inline puro, cero JS; los niveles superiores
añaden SSR e hidratación en cliente más adelante).

Un fichero `.fud` mezcla HTML, CSS con scope (`<style host>`) y construcciones con
prefijo `@`: control de flujo, expresiones y bloques `@code` (`@if`, `@foreach`,
`@(expr)`, `@code { @server / @client }`). Mira `packages/compiler/fixtures/*.fud`
para los tres ejemplos canónicos que guían los tests de integración.

El compilador es **LSP-first**: está diseñado desde el primer commit para sustentar un
language server (Volar), no solo un build batch. Esa única decisión moldea cada
invariante de abajo.

## Pila tecnológica

| Pieza | Versión | Rol |
|---|---|---|
| Node.js | `>=22.12.0` (`.nvmrc`) | Runtime |
| pnpm | `11.x` (Corepack, `packageManager`) | **Único** gestor de paquetes — el único lockfile es `pnpm-lock.yaml` |
| TypeScript | `5.9.x` | Tipado estricto (ver abajo); alineado con el minor de Volar |
| Vite | `8.0.x` | Bundler / dev server **solamente** — nunca el parser |
| Vitest + `@vitest/coverage-v8` | `4.1.x` | Tests + cobertura |
| `oxc-parser` | última estable `0.x` | Parser JS/TS nativo (NAPI); dependencia de **runtime** del compilador |

TypeScript está en modo máximo estricto (`tsconfig.base.json`, compartido por todos los
paquetes): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `isolatedModules`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`. Son **contrato, no preferencia** — no los relajes. En
particular, con `exactOptionalPropertyTypes` un campo `{ x?: T }` es *ausente o T*,
nunca `T | undefined`; omite los campos opcionales, no les asignes `undefined`.

## Estructura del repositorio

```
/
├── package.json            # raíz del workspace (privado): engines, scripts con fan-out pnpm -r
├── pnpm-workspace.yaml      # packages: ['packages/*'] + onlyBuiltDependencies: [oxc-parser]
├── tsconfig.base.json       # config TS estricta compartida; cada paquete la extiende
├── docs/
│   ├── sdd/                 # los documentos de especificación que guían la implementación (ver abajo)
│   │   ├── INDEX.md         # índice maestro + grafo de dependencias + registro de progreso
│   │   └── SDD-NN-*.md
│   └── gramar/
│       └── gramatica-v1-decisiones.md   # decisiones de gramática v1 numeradas (1–66)
└── packages/
    └── compiler/            # @fudic/compiler — el único paquete por ahora
        ├── src/             # código fuente (entrada: src/index.ts)
        ├── test/            # specs de Vitest (test/**/*.test.ts)
        └── fixtures/        # ficheros .fud canónicos para tests de integración
```

Previstos pero aún no creados: `@fudic/core` y sus capas `ssr` / `dom`.

## Cómo se organiza el trabajo: flujo SDD

La implementación la guían los **Spec-Driven Documents** bajo `docs/sdd/`. Cada SDD
describe **qué** construir y **cómo verificarlo**, no el código. El flujo:

1. Pedro redacta un SDD (en español, a menudo vía Claude web).
2. Claude Code lo **revisa primero**, buscando errores, contradicciones entre la interfaz
   pública (§3) y los criterios de aceptación (§6), y huecos de diseño. Hay que sacar
   esto a la luz antes de implementar.
3. Una vez corregido y en estado `Listo`, Claude Code lo implementa de forma
   **autocontenida** — las *Dependencias* (§2) y la *Interfaz pública* (§3) de un SDD
   están pensadas para bastar; no deberías necesitar leer SDD hermanos para implementar
   uno.
4. Los **criterios de aceptación** del SDD definen "hecho". La implementación es correcta
   cuando pasan `pnpm typecheck` + los tests de esos criterios.

`docs/sdd/INDEX.md` tiene la tabla maestra, el grafo de dependencias, el camino crítico
y el registro de progreso. Actualiza el registro de progreso y el estado del SDD cuando
una spec aterrice.

## Reglas de oro (aplican a todo SDD)

- **Repo limpio, desde cero.** El prototipo `compiler-master` (2019) aporta *ideas
  validadas* (identidad de nodos para hidratación, patrón visitor, detección
  `hasShadow`) — **nunca código, nunca sus dependencias**.
- **Spans universales.** Todo token y todo nodo del AST lleva un `Span` (offset UTF-16
  `[start, end)`). Sin excepción. Nunca se guardan líneas/columnas — esa conversión es
  un `LineMap` en SDD-13.
- **El parser nunca lanza.** Ante input roto *emite un `Diagnostic` con su span y
  continúa*. Esto separa un language server de un compilador batch. La forma tipada de
  esta regla es `ParseResult<T> = { value, diagnostics }`.
- **AST navegable por offset desde el primer commit.** El reparseo incremental puede
  diferirse, pero solo si la *forma* del AST ya lo permite (nodos inmutables,
  `ModeStack.clone()`).
- **Oxc se invoca exactamente una vez por fichero.** Los fragmentos JS se acumulan en un
  buffer sintético con tabla de regiones; los spans de error se mapean de vuelta.

## Convenciones

- **Idioma.** El código (identificadores, comentarios, strings de mensajes de
  diagnóstico) va **siempre en inglés**. Los SDD y los docs de gramática van en
  **español**. La conversación con Pedro es en **español**. No metas español en los
  ficheros de código fuente.
- **Diseño.** **SOLID** estricto, con patrones de diseño donde de verdad apliquen.
- **Versiones exactas.** Ancla las dependencias exactas (sin `^`/`~`). Solo
  `engines.node` usa un rango `>=`.
- **Códigos de diagnóstico.** Formato `FUD` + 4 dígitos (`FUD0001`). Cada SDD reserva su
  propio rango; el catálogo consolidado vive en SDD-12.
- **Commits de git.** Solo asunto + cuerpo. **Sin** `Co-Authored-By`, firmas ni ningún
  trailer de atribución. Commitea/pushea **solo cuando se pida explícitamente**; crea
  antes una rama desde `main`.

## Restricciones — NO hacer

- **No instalar** `parse5`, `@babel/*` ni `postcss`. El parser HTML, las reglas de
  transición del `@` y el CSS-con-Razor son todos propios, escritos a mano (decisión 38:
  subset HTML estricto, sin error recovery de HTML5). Oxc sustituye a Babel.
- **No usar Vite/Rolldown para parsear `.fud`.** Vite es solo dev server/bundler.
- **No relajar las opciones estrictas de TS** por comodidad.
- **No romper las fronteras de paquetes:** las deps de runtime (p. ej. `oxc-parser`)
  viven en el paquete que las consume; el tooling compartido vive en la raíz. pnpm no
  expone phantom deps — todo import debe corresponder a una dependencia declarada.
- **No dejar que un SDD invada al siguiente.** Respeta el *Fuera de alcance* (§7) de cada
  SDD; implementa solo lo que la spec actual posee.
- **No añadir `package-lock.json` / `yarn.lock`.** pnpm es el único gestor de paquetes.

## Comandos

Ejecuta desde la raíz del repo (los scripts raíz hacen fan-out con `pnpm -r`), o acota
con `pnpm --filter @fudic/compiler <script>`:

```sh
pnpm install      # instala deps del workspace (debe resolver el binario nativo de oxc-parser)
pnpm typecheck    # tsc --noEmit estricto en todos los paquetes
pnpm test         # vitest run
pnpm build        # tsc -p tsconfig.build.json
```

Extras por paquete (`packages/compiler`): `test:watch`, `coverage`. El suelo de
cobertura es 80/80/75 (líneas/funciones/ramas), elevado por módulo en SDD posteriores —
los módulos de tipos y las utilidades puras pequeñas deberían acercarse al 100%.
