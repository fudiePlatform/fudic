# BUG-14 — Tareas

> **BUG:** [BUG-14 — El texto literal del autor no llega intacto al output](./BUG-14-texto-literal-no-sobrevive.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/ssr` · **Rama:** `fix/bug-14-texto-literal`
> **Progreso:** 6 / 9

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

---

## Fase 0 — Rojo primero (4)

- [x] **1. Test del `@@` en contenido.**
      En `packages/compiler/test/emit/`: `@@server` produce el texto `@server` en el módulo
      SSR y en el chunk de cliente. **Verlo fallar** — hoy emite `server` (§6.1).
- [x] **2. Test de la entidad.**
      Mismo sitio: `&lt;html&gt;` produce el HTML `&lt;html&gt;`, escapado **una** vez.
      **Verlo fallar** — hoy sale `&amp;lt;html&amp;gt;` (§6.2).
- [x] **3. Test de que la interpolación sigue escapándose.**
      Una expresión que devuelve `<script>alert(1)</script>` sale escapada. **Debe pasar en
      verde ya**: es la red que impide que las tareas 5-7 abran un agujero (§6.4).
- [x] **4. Test extremo a extremo sobre el ejemplo.**
      `dist/about/index.html` contiene `@server load` y `&lt;html&gt;`. **Verlo fallar**
      (§6.3). No se toca `about.fud`: está bien escrito, y por eso sirve de test.
      Vive en `packages/vite/test/build-text-literal.test.ts`: el criterio habla del
      **fichero que escribe el build**, y solo un `vite build` real lo produce.

## Fase 1 — El `@@` de contenido (2)

- [x] **5. Resolver `at-escape` al construir los runs de texto.**
      Modificar el emit de runs (`packages/compiler/src/emit/runs.ts`, compartido por las dos
      ramas) para que un `AtEscapeNode` contribuya el carácter `@` al run, como ya hace
      `parser.ts:472-476` en un valor de atributo. El nodo se queda en el AST con su span
      —lo necesitan el LSP y el formateador—; lo que cambia es que el emit lo lee. Verde en 1.
- [x] **6. Ningún token del lexer sin consumidor.**
      Dejar el caso cubierto de forma que no se pueda repetir: un `switch` exhaustivo sobre el
      tipo de contenido, o un test que recorra los tipos de `HtmlContent` y falle si alguno no
      produce salida. Es la invariante nueva de §5, y es lo que habría cazado esto.
      Resuelto con una **tabla total** `Record<HtmlContent['type'], ContentRole>` en
      `runs.ts`: un tipo de nodo nuevo no compila hasta que esa tabla decide qué es. Un
      `switch` con guarda `never` habría dejado una rama inalcanzable, y por tanto sin
      cubrir.

## Fase 2 — Las entidades (2)

- [ ] **7. Decodificar en compilación.**
      Aplicar §3.2: el dato del nodo de texto lleva el carácter, no la entidad. Subset
      estricto (decisión 38): las cinco de XML más las numéricas; una entidad fuera del subset
      es un diagnóstico con su span, no una tabla de 2.200 entradas. `escapeText`
      (`packages/ssr/src/serialize.ts:49`) **no se toca**. Verde en 2 y 4, y 3 sigue verde.
- [ ] **8. Derogar el «pass-through» de la decisión 49.**
      Modificar `docs/gramar/gramatica-v1-decisiones.md` (decisión 49 y su fila del índice) y
      el comentario de `packages/compiler/src/html/nodes.ts:80`, que hoy afirma lo contrario.
      El porqué, en una línea: **el cliente no tiene serializador**, y `textContent` no
      interpreta entidades, así que verbatim hace divergir SSR e hidratación.

## Fase 3 — Cierre (1)

- [ ] **9. Verde, equivalencia y goldens.**
      `pnpm typecheck`, `pnpm test` y `pnpm build`. Añadir a `equivalence.test.ts` un caso con
      entidad y otro con `@@` (§6.5). Comprobar §6.6 (atributos) y §6.7 (el CSS sigue
      verbatim). Los goldens solo se mueven donde haya `@@` o entidades.

---

## Cierre del BUG

- [ ] Marcar BUG-14 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar en la decisión 1 de la gramática que el escape ya se cumple en las dos
      posiciones, contenido y atributo.
