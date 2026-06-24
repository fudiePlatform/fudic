# SDD-00 — Toolchain y dependencias de compilación

> **Estado:** `Listo`
> **Depende de:** — (es el SDD raíz)
> **Decisiones de gramática:** — (transversal, no implementa reglas de lenguaje)

---

## 1. Contexto y objetivo

Fijar el entorno de build, test y tipado del repositorio **antes** de escribir
cualquier línea del compilador. Sin esto, cada sesión de implementación improvisa
versiones y herramientas, y la divergencia contamina todos los SDD siguientes.

Este SDD produce un repositorio limpio, instalable y testeable: `npm install`
seguido de `npm test` debe funcionar sobre un esqueleto mínimo. No implementa
ninguna lógica del compilador; entrega el andamiaje sobre el que el resto se construye.

**Repo limpio.** Construcción desde cero. Del prototipo `compiler-master` (2019)
no se importa código ni dependencias (nada de parse5, Babel, PostCSS). Solo migran
ideas validadas en SDD posteriores.

---

## 2. Dependencias

Ninguna. Es el punto de entrada del proyecto.

---

## 3. Versiones fijadas

Todas las versiones se **anclan exactas** en `package.json` (sin `^` ni `~`) para
garantizar reproducibilidad entre la máquina de Pedro y las sesiones de Claude Code.
Verificadas vigentes a junio de 2026.

### Runtime

| Pieza | Versión | Notas |
|---|---|---|
| Node.js | `>=22.12.0` | Requisito de Vite 8 (acepta 20.19+, pero se fija 22 LTS como base). Declarado en `engines` y `.nvmrc`. |
| pnpm | `>=11` | Gestor de paquetes del proyecto. Fijado en `packageManager` del `package.json` raíz (Corepack). Único lockfile permitido: `pnpm-lock.yaml`. Ver §3.3. |

### Dependencias de desarrollo (anclar exactas)

| Paquete | Versión | Rol |
|---|---|---|
| `typescript` | `5.9.x` | Tipado y compilación a JS. Anclar al minor que use Volar en su día. |
| `vite` | `8.0.x` | Bundler unificado (Rolldown + Oxc internos). Solo para el plugin y el dev server, **no** para el parser. |
| `vitest` | `4.1.x` | Framework de test. Reusa el pipeline de Vite. NO usar 5.0 (beta). |
| `@vitest/coverage-v8` | `4.1.x` | Cobertura. Debe coincidir en minor con `vitest`. |
| `oxc-parser` | última `0.x` estable | Parser JS/TS (binario NAPI nativo). Invocado **una sola vez por fichero** (decisión 6, 32). Ver §3.1. |
| `@types/node` | `22.x` | Tipos de Node. |

### 3.1. Nota sobre `oxc-parser` (crítica)

`oxc-parser` es un binario nativo (NAPI-RS), no JS puro. Implicaciones que Claude
Code debe respetar:

- Se instala con binarios precompilados por plataforma (`@oxc-parser/binding-*`).
  En CI y en local debe permitirse la descarga del binario correcto. Si el entorno
  bloquea binarios, falla la instalación.
- La API es síncrona (`parseSync`) y asíncrona (`parseAsync`). El pipeline del
  compilador usa la que se decida en SDD-10; aquí solo se fija la dependencia.
- **No** se ancla a una versión de mi memoria: Claude Code resuelve la última `0.x`
  estable en el momento de implementar y la fija exacta. Oxc aún es pre-1.0 y se
  mueve rápido; conviene revisar el changelog al actualizar.

### 3.2. Lo que NO se instala

- `parse5` — se escribe parser HTML propio (decisión 38: subset estricto).
- `@babel/*` — Oxc sustituye a Babel.
- `postcss` — el CSS-con-Razor se maneja en el parser propio (SDD-09).
- `eslint` / `prettier` — opcional; si se añaden, en un SDD aparte para no
  bloquear el arranque. Recomendación: usar el linter/formatter de Oxc (`oxlint`)
  cuando se aborde, por coherencia con el toolchain.

### 3.3. Nota sobre pnpm (crítica)

El proyecto usa **pnpm** como gestor de paquetes. Implicaciones que Claude Code debe respetar:

- **`packageManager` fijado.** En el `package.json` **raíz**, campo `packageManager: "pnpm@11.x.x"`
  (versión exacta), para que Corepack active la versión correcta automáticamente.
- **Lockfile único.** Solo se commitea `pnpm-lock.yaml`. Si aparece un `package-lock.json`
  o `yarn.lock`, es un error: se borra. Añadir ambos a `.gitignore` como red de seguridad.
- **Scripts de build de dependencias bloqueados por defecto.** Desde pnpm 10, los scripts
  `postinstall`/`install`/`preinstall` de las dependencias NO se ejecutan salvo allowlist
  explícita. `oxc-parser` necesita su script para resolver el binario nativo. Hay que
  declararlo en `onlyBuiltDependencies` dentro de `pnpm-workspace.yaml` (ver §3.4).
  **Sin esto, Oxc no carga y la instalación parece correcta pero el binario falta** — es el
  fallo silencioso más probable de todo el arranque.
- **Resolución estricta.** pnpm no expone dependencias no declaradas (no hay "phantom
  dependencies"). Cualquier import debe corresponder a un paquete en `package.json`. Esto
  es deseable: control exacto de qué entra en cada bundle.

### 3.4. Configuración de pnpm (workspace)

`packageManager` se fija exacto en el `package.json` **raíz**:

```json
{ "packageManager": "pnpm@11.9.0" }
```

El allowlist de build scripts vive en `pnpm-workspace.yaml`. **Desde pnpm 11 el campo
`pnpm.onlyBuiltDependencies` de `package.json` se ignora** (pnpm avisa con
`The "pnpm" field in package.json is no longer read by pnpm`); el ajuste se movió aquí:

```yaml
packages:
  - 'packages/*'

onlyBuiltDependencies:
  - oxc-parser
```

Si al instalar pnpm reporta otros paquetes con scripts de build bloqueados que sean
legítimos (p. ej. algún binding de `@oxc-parser/*`), se añaden a la lista de forma
explícita y consciente, nunca con un allowlist global.

> **Nota de implementación.** Aunque `oxc-parser` aparece en la tabla de §3 junto a las
> herramientas de desarrollo, es una **dependencia de runtime** del compilador (el emit lo
> invoca en producción): va en `dependencies`, no en `devDependencies`. El resto
> (`typescript`, `vite`, `vitest`, `@vitest/coverage-v8`, `@types/node`) sí son `devDependencies`.

### 3.5. Monorepo (activado desde el inicio)

El proyecto es un **monorepo pnpm desde el día 1**. Cada paquete vive bajo `packages/`,
nunca en la raíz; `pnpm-workspace.yaml` declara `packages: ['packages/*']`.

- **Paquete único por ahora:** `@fudic/compiler` en `packages/compiler/`.
- **Paquetes previstos (mínimo):** `@fudic/core` y sus capas `@fudic/core/ssr` y
  `@fudic/core/dom` (naming exacto —subpath export de core o paquetes propios— a confirmar
  al crearlos).
- **Tooling compartido en la raíz:** `typescript`, `vite`, `vitest`, `@vitest/coverage-v8`
  y `@types/node` son `devDependencies` del `package.json` raíz (privado); sus scripts hacen
  fan-out con `pnpm -r`. Las dependencias de **runtime** (p. ej. `oxc-parser`) viven en el
  `package.json` del paquete que las usa.
- **Config TS compartida:** `tsconfig.base.json` en la raíz; cada paquete extiende de él.

---

## 4. Estructura del repositorio

```
/
├── package.json            // workspace root (private): engines, packageManager, devDeps, scripts -r
├── pnpm-workspace.yaml     // packages: ['packages/*'] + onlyBuiltDependencies
├── pnpm-lock.yaml          // único lockfile permitido
├── tsconfig.base.json      // configuración TS estricta compartida (ver §5)
├── .nvmrc                  // 22.12.0
├── .gitignore
├── README.md
├── /docs
│   └── /sdd                // todos los SDD viven aquí
│       ├── INDEX.md
│       ├── SDD-00-toolchain.md
│       └── ...
└── /packages
    └── /compiler                   // @fudic/compiler
        ├── package.json            // deps de runtime (oxc-parser), scripts del paquete
        ├── tsconfig.json           // extends ../../tsconfig.base.json (ver §5)
        ├── tsconfig.build.json     // extends del anterior, para emit
        ├── vitest.config.ts        // configuración de test
        ├── README.md
        ├── /src
        │   └── index.ts            // punto de entrada (placeholder en este SDD)
        ├── /test
        │   ├── smoke.test.ts       // test mínimo que valida el andamiaje
        │   └── oxc.test.ts         // confirma que el binario nativo de oxc carga
        └── /fixtures               // ficheros .fud canónicos para tests de integración
            ├── app-button.fud
            ├── app-card.fud
            └── home.fud
```

El paquete único de este SDD se llama **`@fudic/compiler`** (scope `@fudic`; la `c` final
alude a *compilador*). Es el primer paquete del monorepo (§3.5).

Los tres ficheros de `/fixtures` se copian literalmente de los ejemplos canónicos
de `gramatica-v1-decisiones.md` (sección 11). Sirven de banco de pruebas vivo desde
el primer SDD; cada SDD posterior los usa para verificar que su pieza los procesa.

---

## 5. Configuración de TypeScript

En el monorepo la config TS se reparte en ficheros con responsabilidades separadas:

- **`tsconfig.base.json`** (raíz) — modo estricto máximo, **sin opciones de emisión** ni
  `include`. La base que comparten todos los paquetes.
- **`packages/compiler/tsconfig.json`** — `extends` de la base; añade `include: ["src", "test"]`
  para el `typecheck` del paquete.
- **`packages/compiler/tsconfig.build.json`** (§5.1) — `extends` del anterior; añade *solo* lo
  que emite el paquete (`rootDir`, `outDir`, `declaration`, `sourceMap`), restringido a `src`.

Esta separación es **obligatoria**, no estética: si las opciones de emisión
(`declaration`/`rootDir`/`outDir`) viven en una config cuyo `include` también cubre `test`,
entonces `tsc --noEmit` falla con **TS6059** (`test/*` no está bajo `rootDir: ./src`).
`--noEmit` **no** suprime esa comprobación cuando `declaration: true` está activo: la
planificación de los `.d.ts` valida `rootDir` igualmente. Por eso las opciones de emisión
solo viven en `tsconfig.build.json`.

`tsconfig.base.json` (raíz) — estas opciones son contrato, no preferencia:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2024"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  }
}
```

`packages/compiler/tsconfig.json` — solo hereda y declara qué typechquear:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Justificación de las no obvias:

- `target` / `lib` `ES2024` — última edición ECMAScript finalizada; Node 22 la soporta de
  forma nativa, así que no hay *downleveling*. (No `ES2023`: TC39 ya cerró 2024.)
- `noUncheckedIndexedAccess` — obliga a tratar accesos a array/objeto como
  posiblemente `undefined`. Crítico en un parser que indexa streams de tokens por
  offset: previene la clase de bug más común al navegar buffers.
- `exactOptionalPropertyTypes` — distingue `{ x?: T }` de `{ x: T | undefined }`.
  Relevante para los nodos del AST con campos opcionales (spans, hijos).
- `isolatedModules` + `verbatimModuleSyntax` — compatibilidad con el transform de
  Oxc/Rolldown, que compila fichero a fichero sin información de tipos cruzada.

### 5.1. `tsconfig.build.json`

Hereda del base y añade las opciones de emisión, restringido a `src` (los tests no se
publican). Es el único config que emite (`pnpm build`).

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

---

## 6. Scripts de `package.json`

Cada paquete define sus scripts. El `package.json` **raíz** expone los mismos nombres
haciendo fan-out con `pnpm -r` (`"test": "pnpm -r test"`, etc.), de modo que `pnpm test`
en la raíz corre los tests de todos los paquetes del workspace.

Scripts de `packages/compiler/package.json`:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage"
  }
}
```

---

## 7. Configuración de Vitest

`vitest.config.ts` mínimo. La cobertura se exige alta desde el principio porque un
parser sin cobertura de casos límite es un parser roto en producción.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // The balancer (SDD-02) and tokenizer (SDD-03) should approach 100%.
        // Conservative global floor; raised per-module in later SDDs.
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
```

---

## 8. Invariantes LSP (recordatorio transversal)

Este SDD no implementa lógica, pero fija las condiciones que la harán posible:

- TypeScript estricto con `noUncheckedIndexedAccess` → seguridad al navegar por offset.
- Vitest en watch → ciclo de feedback rápido, imprescindible para iterar el parser
  contra cientos de casos límite.
- Versión de TypeScript alineable con Volar → la integración LSP futura no obliga a
  reescribir tipos.

---

## 9. Criterios de aceptación

El SDD está `Hecho` cuando, en un clon limpio:

1. **Instalación.** `pnpm install` completa sin error, incluyendo el binario nativo
   de `oxc-parser` para la plataforma actual. No quedan paquetes con scripts de build
   pendientes que afecten al funcionamiento (Oxc en particular debe haber resuelto su binario).
2. **Typecheck.** `pnpm typecheck` pasa sin error sobre el esqueleto.
3. **Test smoke.** `pnpm test` ejecuta `test/smoke.test.ts` y pasa. El test smoke
   contiene como mínimo:
   ```ts
   import { describe, it, expect } from 'vitest';

   describe('scaffolding', () => {
     it('the test environment works', () => {
       expect(1 + 1).toBe(2);
     });
   });
   ```
4. **Oxc vivo.** Un segundo test importa `oxc-parser`, parsea un fragmento trivial
   (`const x = 1;`) y verifica que devuelve un AST sin errores. Esto confirma que el
   binario nativo carga correctamente en el entorno — el fallo más probable de toda
   la instalación, y la razón por la que `oxc-parser` está en `onlyBuiltDependencies`.
5. **Fixtures presentes.** Los tres `.fud` canónicos existen en `/fixtures` con el
   contenido exacto de la gramática.
6. **Versiones ancladas.** Ninguna entrada de `dependencies`/`devDependencies` contiene
   rango (`^`, `~`): todas son exactas. Única excepción admitida: `engines.node`, que usa
   `>=22.12.0` (el `>=` es lo idiomático para un rango de motor, no para una dependencia).
   La versión exacta de Node para desarrollo se fija en `.nvmrc`; `pnpm` se fija exacto en
   `packageManager`.
7. **pnpm como único gestor.** Existe `pnpm-lock.yaml` y NO existen `package-lock.json`
   ni `yarn.lock` (ambos en `.gitignore`). El allowlist `onlyBuiltDependencies` —en
   `pnpm-workspace.yaml`, no en `package.json` (pnpm 11 ya no lee ese campo)— incluye
   `oxc-parser`.

---

## 10. Fuera de alcance

- Cualquier lógica del compilador (tokenizer, parser, emit). Eso empieza en SDD-01.
- Configuración del plugin de Vite/Rolldown propio (SDD posterior al emit).
- Creación de paquetes adicionales (`@fudic/core`, etc.): aquí solo se crea
  `@fudic/compiler`. El workspace ya queda activado (§3.5).
- ESLint / Prettier / oxlint (SDD opcional aparte).
- CI/GitHub Actions (recomendado, pero no bloquea el arranque; SDD aparte).
- Decisión síncrono vs asíncrono en la invocación de Oxc (se resuelve en SDD-11).
