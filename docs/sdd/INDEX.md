# Índice maestro de SDD — Compilador `.fud`

> **Qué es esto.** El índice de los Spec-Driven Documents que definen la construcción
> del compilador. Cada SDD describe **qué** construir y **cómo verificar** que está bien,
> no el código. Claude Code lee un SDD, implementa, y los criterios de aceptación del
> propio SDD determinan si la implementación es correcta.
>
> **Flujo de trabajo.** Las specs (SDD-NN) se generan a demanda. Cuando un SDD pasa a
> estado `Listo`, Claude Code lo implementa de forma autocontenida. Un SDD no debería
> requerir leer los otros para implementarse: su sección *Dependencias* declara qué
> interfaces ya están disponibles, y su sección *Interfaz pública* declara qué expone.

---

## Convenciones

### Estados

| Estado | Significado |
|---|---|
| `Pendiente` | Aún no escrito. |
| `Listo` | Spec completa y revisada. Claude Code puede implementar. |
| `En curso` | Claude Code implementando. |
| `Hecho` | Implementado y todos los criterios de aceptación pasan. |
| `Bloqueado` | Esperando a que una dependencia llegue a `Hecho`. |

### Formato de cada SDD

Todos los SDD siguen la misma estructura fija:

1. **Contexto y objetivo** — qué pieza es, dónde encaja en el pipeline.
2. **Dependencias** — qué SDD deben estar en `Hecho` antes, con las interfaces que aportan.
3. **Interfaz pública** — las firmas TypeScript exactas que el módulo expone. Es el contrato.
4. **Comportamiento** — las reglas, ancladas por número a las decisiones de gramática (`gramatica-v1-decisiones.md`).
5. **Invariantes LSP** — spans en todo, no lanzar nunca, navegabilidad por offset. Transversal: presente en cada SDD.
6. **Criterios de aceptación** — la batería de tests que define "hecho". Entradas concretas → salidas esperadas.
7. **Fuera de alcance** — qué NO implementar aquí, para evitar invasión del SDD siguiente.

### Reglas de oro (aplican a todos los SDD)

- **Repo limpio.** El parser se construye desde cero. Del prototipo `compiler-master` (2019)
  se traen *ideas* validadas (identidad de nodos, patrón de visitors, detección `hasShadow`),
  nunca código. No se usa parse5 (decisión 38: subset estricto, sin error recovery HTML5).
- **TypeScript desde el día 1.**
- **Spans universales.** Todo token y todo nodo del AST lleva `Span` (offset inicio/fin). Sin excepción.
- **El parser nunca lanza.** Ante input roto: emite un diagnóstico con su span y continúa. Esto separa
  un compilador batch de un language server.
- **AST navegable por offset** desde el primer commit. El reparseo incremental puro puede diferirse,
  pero solo si la *forma* del AST ya lo permite.
- **Oxc se invoca exactamente una vez por fichero** (los fragmentos JS se acumulan en un buffer
  sintético con tabla de regiones; los spans de error se mapean de vuelta).

---

## Tabla maestra

| SDD | Nombre | Estado | Depende de | Decisiones de gramática |
|---|---|---|---|---|
| [00](./SDD-00-toolchain.md) | Toolchain y dependencias de compilación | `Hecho` | — | — |
| [01](./SDD-01-andamiaje.md) | Andamiaje y tipos base | `Hecho` | 00 | — |
| [02](./SDD-02-balanceador.md) | Balanceador de delimitadores | `Listo` | 00, 01 | 6 |
| [03](./SDD-03-tokenizer.md) | Tokenizer + pila de modos | `Listo` | 00–02 | notas (modos) |
| [04](./SDD-04-transicion-at.md) | Reglas de transición del `@` | `Pendiente` | 00–03 | 1–8 |
| [05](./SDD-05-parser-html.md) | Parser HTML (subset estricto) | `Pendiente` | 00, 03, 04 | 38–52 |
| [06](./SDD-06-control-flujo.md) | Construcciones de control de flujo | `Pendiente` | 00, 04, 05 | 9–17 |
| [07](./SDD-07-bindings.md) | Interpolación y bindings | `Pendiente` | 00, 04, 05 | 18–31 |
| [08](./SDD-08-code-block.md) | Bloque `@code` (server/client/neutral) | `Pendiente` | 00, 04, 05 | 32–34 |
| [09](./SDD-09-css-razor.md) | CSS con Razor (`<style>`) | `Pendiente` | 00, 04, 05 | 42 (a–e) |
| [10](./SDD-10-documento.md) | Estructura del documento | `Pendiente` | 00, 05, 08 | 53–62 |
| [11](./SDD-11-oxc.md) | Integración Oxc | `Pendiente` | 00, 02 | 6, 32 |
| [12](./SDD-12-semantica.md) | Análisis semántico | `Pendiente` | 00, 05–10, 11 | 19, 31, 33.a/b, 41, 45 |
| [13](./SDD-13-source-maps.md) | Source maps | `Pendiente` | 00, 11 | notas |
| [14](./SDD-14-emit-nivel-1.md) | Emit nivel 1 (end-to-end) | `Pendiente` | 00, 05–12 | niveles L1 |

---

## Grafo de dependencias

```
SDD-00  Toolchain (entorno: TS, Vite 8, Vitest, Oxc, fixtures)
   │
   ▼
SDD-01  Andamiaje (tipos base: Span, Diagnostic, ParseResult, ModeStack)
   │
   ├─────────────┐
   ▼             ▼
SDD-02        (tipos disponibles para todos)
Balanceador
   │
   ├──────────────────────────┐
   ▼                          ▼
SDD-03  Tokenizer        SDD-11  Oxc
   │                          │
   ▼                          │
SDD-04  Transición @          │
   │                          │
   ▼                          │
SDD-05  Parser HTML           │
   │                          │
   ├──────┬──────┬──────┐     │
   ▼      ▼      ▼      ▼     │
 SDD-06 SDD-07 SDD-08 SDD-09  │   ← paralelizables entre sí
 Control Binds  @code  CSS    │
   │      │      │      │     │
   │      │      ▼      │     │
   │      │   SDD-10    │     │
   │      │   Documento │     │
   │      │      │      │     │
   └──────┴──────┴──────┴─────┘
                 │
                 ▼
          SDD-12  Semántica
                 │
                 ▼
          SDD-13  Source maps
                 │
                 ▼
          SDD-14  Emit nivel 1  ◄── HITO: home + app-card + app-button → HTML puro
```

### Camino crítico

`00 → 01 → 02 → 03 → 04 → 05` en serie. El toolchain (00) y el andamiaje de tipos (01)
son prerrequisito de todo. A partir de ahí, el balanceador, el tokenizer, la transición `@`
y el parser HTML forman la columna vertebral; nada paraleliza aquí.

A partir de `05`, los SDD **06 / 07 / 08 / 09 son paralelizables** entre sí (todos cuelgan
del parser HTML pero no dependen unos de otros). `10` necesita además `08` (el `@code`
participa en la estructura del documento).

`11 (Oxc)` puede arrancar en cuanto exista `02`, en paralelo con toda la rama del tokenizer.

`12`, `13` y `14` son convergentes: requieren que la rama de parsing esté completa.

### Transversales (no son fases)

- **Invariantes LSP** (tolerancia a errores, spans, navegabilidad por offset): incrustados en
  cada SDD desde el 00. No se retrofitean.
- **Reparseo incremental**: la *forma* del AST debe permitirlo desde el 01; la implementación
  incremental se difiere a un SDD posterior al 14.
- **Integración Volar / Language Server**: posterior al 14. Consume la API de query por offset
  que los SDD 01–05 ya garantizan.

---

## Hito de cierre

**SDD-14** es el criterio de éxito del bloque inicial: los tres ficheros canónicos
`home.fud` + `app-card.fud` + `app-button.fud` compilan a **HTML puro de nivel 1**
(DSD expandido inline, cero JS). Cuando ese end-to-end pasa, la columna vertebral del
compilador está validada y todo lo demás (niveles 2 y 3, SSR dinámico, polyfill `<style host>`)
cuelga de una base demostrada.

---

## Registro de progreso

| Fecha | SDD | Cambio |
|---|---|---|
| 2026-06-24 | 00 | Andamiaje montado como monorepo pnpm: `packages/compiler` (`@fudic/compiler`) con TS 5.9.3 (target ES2024), Vite 8.0.16, Vitest 4.1.9, oxc-parser 0.137.0, pnpm 11.9.0. Criterios de aceptación verdes. |
| 2026-06-24 | 02 | Spec redactada y en estado `Listo`. API: núcleo `scanBalanced(source, openOffset, closer)` + envoltorios `scanParens/Brackets/Braces`. Salida `BalancedGroup` (span, inner, closed, tabla de `LexRegion[]`). Regex vs división por token anterior. Rango `FUD0002`–`FUD0009` reservado. |
| 2026-06-25 | 03 | Spec redactada y en estado `Listo`. Cursor `Lexer` perezoso (`peek`/`next`/`seekTo`, dueño de `ModeStack`). Tokens contextuales con regiones JS opacas (átomos vía balanceador). `@` léxico (`@@`/`@*`/`@(`/`@{` + lookbehind email) en el tokenizer; keywords/implícitas → `at-trigger` para SDD-04. Rango `FUD0010`–`FUD0029`. ⚠️ §4.6 marca contradicción `<title>` opaco (notas modos) vs `home.fud` con `@data.title` — pendiente de confirmar con Pedro. |
