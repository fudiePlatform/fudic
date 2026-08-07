# BUG-16 — Tareas

> **BUG:** [BUG-16 — Pasar una prop tiene dos formas](./BUG-16-props-con-punto.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/language-core` · `@fudic/language-server`
> **Rama:** la del backlog de uso
> **Depende de:** [BUG-15](./BUG-15-clases-sin-completado.md) **solo en las fases 5 y 6**. Las
> fases 1-4 no comparten un fichero con él y arrancan el mismo día (§1.2 del BUG)
> **Progreso:** 12 / 12

Cada tarea es un paso cerrado. Las rutas son relativas a la raíz del repo.

El orden manda en tres puntos. **La 1 antes que todo**: hay que ver `.tone="info"` no emitir
nada antes de que exista el arreglo, o el test solo demuestra que el emisor hace lo que hace.
**La 2 antes que la 5**: el contrato de tipos se mide con `tsc` antes de escribir emisor, que es
como se hizo BUG-11 y la razón de que saliera a la primera. Y **la 4 antes que la 9**: migrar los
ejemplos antes de que el punto se emita los deja en rojo y sin salida que comparar.

---

## Fase 1 — Rojo primero, y la medida del contrato (2)

- [x] **1. El punto no llega a la salida.**
      En `packages/compiler/test/`, compilar `<app-badge .tone="info">` y afirmar que la salida
      lleva el atributo `tone`. **Verlo fallar hoy**: hoy no emite nada (§6.1). Mismo test para
      la forma interpolada (§6.2).
      *Visto en rojo*: `test/emit/props-dot.test.ts`, 4 de 5 casos fallan contra `main` —el punto,
      el interpolado, el `slot="meta"` del plano (§2.6)—; el único verde es el `.prop` sobre tag
      nativo, que no cambia. Y el rojo destapó §2.6: **ningún** atributo de un host de componente
      se escribe hoy, medido sobre el `dist` del ejemplo.
- [x] **2. El contrato, medido con `tsc`.**
      Un fichero de sonda con `$attrs<{}>({ tone: 'info' })` contra `GLOBALS_DTS`: comprobar que
      el error cae sobre el **nombre** y que un global mal escrito conserva la sugerencia
      (`titel` → `title`). Si el mensaje no aterriza ahí, se replantea el mecanismo antes de
      tocar el emisor (§3.3, §6.6).
      *Medido* en `packages/language-core/test/globals-attrs.test.ts`: `TS2353` sobre `tone`,
      `TS2561` sobre `titel` **con** la sugerencia `'title'`, los globales y los `data-*`/`aria-*`
      aceptados, y un prop declarado sigue dando `TS2322` sobre su nombre. El mecanismo aguanta:
      cero códigos `FUD` nuevos.

## Fase 2 — El emisor: el punto se escribe (2)

- [x] **3. `property` sobre un componente se serializa.**
      `packages/compiler/src/emit/attrs.ts`: en un tag con guion (decisión 41), un binding
      `property` toma las dos ramas que `attr` ya tiene —literal y omitir-si-falsy de la decisión
      21— con el nombre sin el punto. Un tag **nativo** no cambia: sigue sin emitirse (§4.1,
      §6.3). Verde en 1.
      *Tres cosas que la tarea no preveía y hubo que cerrar.* (a) **La gramática tenía que ceder**:
      `.tone="info"` era `FUD0090` («el valor debe ser un `@` único», decisión 23), así que la
      forma que §4.3 declara legal no compilaba. `PropertyBinding.value` pasa a ser
      `AttributeValuePart[]` —la misma forma que un atributo— y acepta constante, expresión o
      nada (`.disabled` = `true`, decisión 44). `FUD0090` **se retira**; la concatenación sigue
      siendo `FUD0091`, pero ya no degrada a atributo plano: un prop escondido del editor por un
      valor mal escrito no ayuda a nadie. (b) **El atributo plano sale del literal de props** y
      pasa a escribirse en el host, que es lo que §4.2 pide y lo que hace que `slot="meta"`
      proyecte por fin. (c) **Una signal cruza su valor, no el objeto**: al ver el servidor los
      props por primera vez, `.value="@count"` pintaba `[object Object]`. `crossingExpr` aplica la
      decisión 84 en los dos emisores —era una regla que solo tenía el cliente— y `MarkupEmitter`
      recibe los nombres de signals para poder aplicarla.
- [x] **4. Los `.fud` del repo, migrados.**
      `examples/basic` y las fixtures de `compiler` pasan a `.prop`. La salida de nivel 1 tiene
      que quedar **idéntica** a la de antes, documento a documento (§4.5, §6.4). Las fixtures del
      `language-server` **no** se tocan aquí: van en la tarea 11, para no pisar la rama de BUG-15.
      *Medido sobre los goldens*: el diff son **cinco líneas, todas añadidas**, y las cinco son
      `setAttr` sobre un host de componente. El shadow no se mueve un byte porque los props que
      llegan al `render` del hijo son los mismos de antes, con el mismo nombre y el mismo valor
      —solo cambia por qué puerta entran—. En `dist/index.html` los hosts salen ya con su
      `slot="meta"`, su `tone` y su `title`/`href`/`variant`.

## Fase 3 — La proyección: dos literales (2)

- [x] **5. `emitProps` reparte.**
      `packages/language-core/src/template/attrs.ts`: en el literal de `$attrs<$C0>` solo los
      `property`; los `attr` planos a un `$attrs<{}>({…})` propio. `slot` sigue fuera de los dos
      (BUG-11) y las anclas de hueco no se tocan todavía (§4.2, §6.5, §6.7).
      *Dos decisiones al escribirlo.* El segundo literal se emite **solo si hay algún atributo
      plano**: uno vacío sería andamiaje que no dice nada. Y las anclas de hueco se quedan en el
      literal de **contrato**, no en el de globales: un hueco es donde va a escribirse un
      atributo, y lo que el developer quiere ahí es el contrato del componente — que es además
      lo que fija §6.3 de SDD-24.
- [x] **6. El nombre del evento deja de ser andamiaje.**
      El literal de `$on` pasa a tramo **proyectado con las comillas incluidas**, mapeado al
      nombre del fuente — el recurso del `@section` de SDD-24, por la misma razón: un rango con
      los extremos en tramos distintos no vuelve a ninguna parte (§4.4).
      *Perfil nuevo*, `LITERAL_NAME_CAPS`: completado **y** diagnóstico, y nada más. El de
      `@section` (`DIAGNOSTIC_ONLY_CAPS`) no vale aquí porque la lista de eventos ES el objetivo.
      *Corregido en la fase 5*: las comillas se quedan **fuera** y el tramo mide 1:1. Medido
      contra TypeScript, el rango de reemplazo vuelve sin comillas —sus dos extremos caen ya
      dentro del tramo del nombre—, y en cambio la asimetría desplazaba cada offset de dentro:
      en `@cli` el rango volvía sobre `li` y aceptar `click` escribía `@cclick` (§4.4).
- [x] **11.a. Las fixtures del `language-server` y de `vscode`, migradas** — adelantadas aquí
      desde la tarea 11. El motivo para aplazarlas era no pisar la rama de BUG-15, y BUG-15 ya
      está `Hecho`: dejar el workspace en rojo entre dos commits pesa más. La tarea 11 conserva
      lo suyo, que son los criterios con `context`.

## Fase 4 — Las anclas del caso vacío (2)

- [x] **7. Ancla para `.|`.**
      Un tramo `COMPLETION_ONLY_CAPS` sobre el punto, apuntando a la posición de clave del
      literal de props. El caso con nombre ya funciona por `emitKey`, que copia el span (§4.3,
      §6.8, §6.9).
      *Medido contra el servicio de TypeScript de verdad*, no contra el texto emitido: en `.|`
      la lista trae `tone` y los items vienen **sin rango de reemplazo**, que es lo que impide
      que el punto se lo coma (§6.8).
- [x] **8. Ancla para `@|`.**
      Lo mismo sobre la arroba, apuntando dentro del literal de `$on` (§4.4, §6.11).
      *Dos cosas que aparecieron al medirlo.* (a) **Un `@` a medio escribir se degrada a atributo
      plano** (`@cli` sin manejador es `FUD0092`), que es justo el instante en que el editor
      pregunta; la proyección lee ahora el **nombre verbatim** y no la clasificación, así que
      `@cli` sigue siendo un evento y no reporta `TS2353` como si fuera vocabulario de HTML.
      (b) **El ancla mide dos caracteres por uno**: el cursor de `@|` está en el final del `@`, y
      con un ancla de un carácter caía sobre la comilla de cierre, donde no se ofrece nada.

## Fase 5 — El editor: quién contesta y quién se aparta (2)

- [x] **9. `propertyContextAt` y `eventContextAt`.**
      `packages/language-server/src/services/position.ts`: el `PartialName` tras el `.` y tras el
      `@` dentro de un tag abierto, con el prefijo **fuera** del span (§3.4). No reconocen un
      punto dentro de un valor entrecomillado ni una arroba en texto de markup.
      *Los dos son la misma función con otra expresión regular*, `prefixedNameAt`, y con las tres
      guardas de `classContextAt`: fuera de un tag abierto un punto es texto (`3.14`) y una arroba
      es la transición; dentro de un valor entrecomillado los dos son cadena ajena; y un prefijo
      que continúa una palabra (`x.`, `a@`, `@@`) no abre nada.
- [x] **10. La regla del tag en `completions()`.**
      `packages/language-server/src/services/plugin.ts`: dentro de un tag abierto, ni Emmet, ni
      tags, ni snippets — el `.` y el `@` los contesta la proyección, y estos contextos existen
      para **no** estorbar. `directiveContextAt` deja de entrar en la zona, con la misma guarda
      `insideOpenTag` que `wordContextAt` ya usa: dentro de un tag el `@` es un evento, nunca una
      directiva (§4.4, §6.10-§6.12).
      *La rama no devuelve lista vacía, devuelve `undefined`*: una lista vacía fija el
      `mainCompletionUri` de Volar y silencia a los demás, que es lo contrario de apartarse. Va
      **después** de `class:` —el prefijo con dos puntos no colisiona con ninguno de los dos— y
      antes de la directiva, que ya no llega a la zona por su propia guarda.

## Fase 6 — Lo que no se puede romper (2)

- [x] **11. Las fixtures del `language-server`, migradas, y los criterios de antes verdes.**
      Aquí y no en la 4: es el fichero que la rama de BUG-15 también toca. Con la sintaxis nueva,
      §6.3 y §6.4 de SDD-24 y §6.9 de BUG-11 siguen verdes, y los tres contextos del editor se
      piden **con `context`**, como los pide un editor (§6.13, §6.14).
      *Los cinco criterios del editor, medidos por LSP* con `triggerKind: 2` y el carácter que el
      usuario acaba de teclear: en `.` la lista trae `tone` y el item **no** lleva rango —una
      inserción, así que el punto sobrevive—; en `.ton` el rango cubre `ton` y nada más; en `@cli`
      viene `click` y **ningún** nombre empieza por `on`; en `@` vienen los eventos y no `@if`; y
      fuera del tag `@fore` sigue ofreciendo `@foreach`. Y el reparto de §4.2 también end-to-end:
      `id`/`class`/`role`/`data-*`/`aria-*` sobre un componente no reportan nada, `tone="info"`
      plano da `TS2353` sobre el nombre y `titel` conserva su sugerencia.
- [x] **12. El build entero.**
      `pnpm build` construye `examples/basic` migrado y los E2E siguen pasando sobre las páginas
      prerenderizadas (§6.15).
      *Verde*: `pnpm build` completo —paquetes, ejemplo y el `.vsix`— y los 16 E2E de Playwright
      sobre el `dist` prerenderizado, incluido el arranque con la red apagada.

---

## Cierre del BUG

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde en todo el workspace.
- [ ] `language-core` y `language-server` siguen al **100 %** en las cuatro métricas;
      `@fudic/compiler` no baja de donde estaba.
- [ ] Marcar BUG-16 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar la regla en [la gramática](../../gramar/gramatica-v1-decisiones.md) §10: sobre un tag
      de componente, `property_binding` es la única vía de prop.
- [ ] Anotar en [SDD-23 §4.4](../SDD-23-emisor-ts-virtual.md) los dos literales, y en
      [SDD-24 §4.2](../SDD-24-language-server.md) los dos contextos nuevos.
