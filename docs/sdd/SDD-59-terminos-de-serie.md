# SDD-59 · Los términos de serie: `@fudic/terms`

> **Estado:** `Listo` (2026-10-16)
> **Paquetes:** `@fudic/terms` (nuevo) · `@fudic/workbench` · `@fudic/language-server` · `fudic-vscode` · `examples/basic`
> **Rango:** `FUD1040`–`FUD1059`.
> **Lo necesita:** [BUG-50](./bugs/BUG-50-la-cli-que-nadie-entiende.md): el `.fudspec` que genera
> `fudic g component` trae un criterio que pasa sin que el usuario escriba ningún término.

---

## 1. Contexto y objetivo

Un `.fudspec` se escribe con **términos**: cada línea de un `given`, `when` o `then` es el nombre
de un módulo `<block>/<nombre>.js` que la ejecuta. SDD-52 definió **dos capas** de términos: la
del proyecto (`fudic/terms/`) y la del framework. Gana la primera que tiene el término, entero,
sin mezclar ([catalog.ts:2-5](../../packages/spec/src/catalog.ts#L2-L5)).

La capa del framework existe en el código pero está **vacía**: el banco la acepta
(`frameworkTerms`, [session.ts:39-40](../../packages/workbench/src/session.ts#L39-L40) y
[session.ts:112](../../packages/workbench/src/session.ts#L112)), el language server también
([server.ts:89-90](../../packages/language-server/src/server.ts#L89-L90)), y ningún paquete la
llena. Hoy cada proyecto escribe sus propios `click`, `text` o `visible`: `examples/basic` tiene
seis en `fudic/terms/`.

Consecuencia: un proyecto recién creado no tiene vocabulario. Un `.fudspec` generado solo puede
ser una plantilla comentada, y quien lo abre no sabe qué escribir.

Este SDD crea `@fudic/terms`, el paquete que llena la capa del framework, y conecta el banco y
el editor a él.

## 2. Dependencias

| SDD | Aporta |
|---|---|
| 52 | El lenguaje `.fudspec`, el contrato del módulo de término (`meta`, `run`, `selfTest`) y las dos capas (`Layer = 'workspace' \| 'framework'`) |
| 53 | `fudic g term` y el esqueleto de un término |
| 32, BUG-48, BUG-49 | El banco: `ctx.locate(ref)` con `box()`, `textContent()`, `isVisible()`, `click()`, `setAttribute()`; `fudic-workbench run` |
| 50 | `@fudic/diagnostics` |

## 3. Interfaz pública

### 3.1. El paquete

```
@fudic/terms
  package.json
  terms/
    when/click.js
    when/set-attribute.js
    then/visible.js
    then/hidden.js
    then/text.js
    then/min-height.js
    then/min-width.js
  dist/index.js        export function termsDir(): string   // absoluto, la carpeta terms/
```

- `"files": ["terms", "dist", "README.md"]`.
- `exports`: `"."` → `dist/index.js` y `"./package.json"`.
- Sin dependencias de runtime. Se instala como **devDependency** del proyecto.

### 3.2. El vocabulario v1

| Bloque | Término | Parámetros | Pasa cuando |
|---|---|---|---|
| `when` | `click` | `target: element` | siempre, tras el clic |
| `when` | `set-attribute` | `target: element`, `attribute: token`, `value: string` | siempre; la evidencia dice el valor anterior |
| `then` | `visible` | `target: element` | `isVisible()` |
| `then` | `hidden` | `target: element` | `!isVisible()` |
| `then` | `text` | `target: element`, `expected: string` | el texto visible contiene `expected` |
| `then` | `min-height` | `target: element`, `px: number` | `box().height >= px` |
| `then` | `min-width` | `target: element`, `px: number` | `box().width >= px` |

`props <nombre>` no es un término: lo resuelve el propio lenguaje (SDD-52) y sigue igual.

Cada `run` devuelve `{ pass, evidence }`; los `then` devuelven `evidence: { expected, actual }`.

### 3.3. Dónde lo buscan el banco y el editor

- **Banco:** `startSession` resuelve `@fudic/terms/package.json` desde la raíz del proyecto y pasa
  `<dir>/terms` como `frameworkTerms`. Si no está instalado, no hay capa de framework: igual que hoy.
- **Editor:** el language server resuelve `@fudic/terms` desde el proyecto del `.fudspec` que
  valida, no desde la carpeta abierta: en un workspace cada app y cada lib tiene el suyo.

## 4. Comportamiento

1. **El proyecto gana.** Un `fudic/terms/then/text.js` del proyecto sustituye entero al de
   `@fudic/terms`. Es la regla de [catalog.ts:2-5](../../packages/spec/src/catalog.ts#L2-L5);
   no cambia.
2. **`fudic/terms/` es para extender.** Un proyecto nuevo no lo tiene. Aparece con el primer
   `fudic g term`.
3. **Los términos del framework no exportan `selfTest`.** FUD0946 solo lo exige a los del
   proyecto ([term-module.ts:100](../../packages/spec/src/term-module.ts#L100)). Se prueban con los
   tests del paquete.
4. **Completado y errores.** Un término desconocido lista también los del framework, y el
   completado del editor los ofrece. Ya lo hace `catalog.list` en cuanto la capa existe.
5. **`examples/basic`** borra sus `click`, `set-attribute`, `text`, `visible` y `min-height`, que
   pasan a venir de `@fudic/terms`, y conserva `given/route.js`. Sus `.fudspec` siguen en verde.

## 5. Invariantes

- Un término es un módulo leído sin ejecutar para validar (SDD-52): `meta` literal, `run`
  exportado por declaración. Los de `@fudic/terms` cumplen el mismo contrato que los del usuario.
- Cobertura: `@fudic/terms` nace al **100 %** en las cuatro métricas (`src/**/*.ts` y
  `terms/**/*.js`). Los paquetes tocados no bajan de su suelo.

## 6. Criterios de aceptación

1. `termsDir()` devuelve una ruta absoluta que existe y contiene `given/`, `when/` y `then/`
   (`given/` puede estar vacía).
2. Cada término de §3.2 pasa el validador estático de SDD-52 con `layer: 'framework'` sin
   diagnósticos.
3. Cada término, ejecutado por `fudic-workbench run` contra un componente de fixture, da `pass`
   en el caso positivo y `fail` (no `error`) en el negativo, con la evidencia de §3.2.
4. Un proyecto con `@fudic/terms` instalado y **sin** `fudic/terms/` ejecuta este spec en verde:
   ```
   component ui-button

   criterion renders
     given
       props base
     then
       visible ui-button
   ```
5. El mismo proyecto **sin** `@fudic/terms`: `visible` es un término desconocido, con el
   diagnóstico de SDD-52, igual que hoy.
6. Un `fudic/terms/then/visible.js` del proyecto sustituye al del paquete: el banco ejecuta el
   del proyecto.
7. En un workspace con dos proyectos, uno con `@fudic/terms` y otro sin él, el editor valida
   cada `.fudspec` con la capa de su proyecto.
8. El completado del editor tras `then` ofrece `visible`, `hidden`, `text`, `min-height` y
   `min-width` en un proyecto sin `fudic/terms/`.
9. `examples/basic`: sin sus cinco términos duplicados, `pnpm test:spec` sale en verde.

## 7. Fuera de alcance

- Términos `given` que naveguen: el banco monta el componente solo y `ctx.goto` no aplica.
- Ampliar `ctx` (leer atributos, estilos, teclado). Un término nuevo que lo necesite es otro SDD.
- Ejecutar `selfTest` de los términos del proyecto.
- La CLI: qué instala y qué genera es [BUG-50](./bugs/BUG-50-la-cli-que-nadie-entiende.md).
