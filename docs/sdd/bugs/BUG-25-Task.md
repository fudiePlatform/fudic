# BUG-25 — Tareas

> **BUG:** [BUG-25 — `control` no tiene mitad de editor](./BUG-25-control-sin-editor.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/forms` · `@fudic/language-core` ·
> `@fudic/language-server` · `fudic-vscode`
> **Rama:** `worktree-sdd-34-forms-compilador` · **Depende de:** SDD-34 en `Hecho`
> **Progreso:** 9 / 9 — `Hecho`

Nueve tareas. Rutas relativas a la raíz del repo; cada una es un paso cerrado y se puede parar
después de cualquiera con el workspace verde.

**El orden manda en dos sitios.** Las **reglas antes que el editor** (1 y 2 antes que 4–7): el
editor pregunta con la función del compilador, así que la regla tiene que existir antes de que
alguien la consulte, o acaban siendo dos. Y **el `@` al final** (8): parte los spans de cuatro
tipos que ya se estaban midiendo, y hacerlo antes obligaría a reescribir esos tests dos veces.

---

## Mapa de dependencias

```
A · las dos reglas (@fudic/compiler + @fudic/forms)
   1 bindByType (109 derogada) ──→ 3 el emit rehace el enlace
   2 controlInsideForm (115, FUD0595) ──┐
                                        ├──→ 4 forms.ts: dónde y qué
B · el editor (language-core + language-server)                      │
   4 forms.ts ──┬──→ 5 posiciones y listas                           │
                ├──→ 6 el hueco de `control=` en la proyección       │
                └──→ 7 hover y bombilla                              │
C · lo que no es de `control`
   8 el `@` como token propio (language-server + vscode)
   9 el eco de la zona neutra (language-core)
```

---

## Fase 1 — Las dos reglas (3)

- [x] **1. `bindByType`, la séptima función.**
      `UnsupportedControl` pierde `'dynamic-type'`; `inputBind`
      ([`binding/control.ts`](../../../packages/compiler/src/binding/control.ts)) devuelve
      `{ kind: 'value', bind: 'bindByType', dynamicType: true }`, y `@fudic/forms/dom` estrena
      [`bind-by-type.ts`](../../../packages/forms/src/dom/bind-by-type.ts) — un módulo propio,
      importado por el chunk del componente que lo escribe y por ningún otro.
- [x] **2. `controlInsideForm`, decisión 115.**
      Analizador nuevo
      ([`control-inside-form.ts`](../../../packages/compiler/src/semantic/analyzers/control-inside-form.ts)):
      un `control` sin `<form control>` por encima es `FUD0595`, con el
      `formassociated` exento. Y el ejemplo canónico rehecho: el `<form>` ajeno desaparece, y
      con él el `name` del host.
- [x] **3. El emit rehace el enlace cuando se mueve el `type`.**
      `#dynamicTypeProp` en
      [`markup-client.ts`](../../../packages/compiler/src/emit/markup-client.ts): el `type` que
      viene de una prop entra en el mismo `$cb` que el nodo, con **un** guard para los dos.

## Fase 2 — El editor de `control` (4)

- [x] **4. `services/forms.ts`: dónde y qué.**
      *Dónde* al parse (`controlSites`, la 115 leída del derecho), *qué* al checker y
      estructuralmente (`nodesInScope`, `nodeMembersAt`, `kindOf`). Más `services/ts-service.ts`,
      porque ya son dos servicios los que piden el programa.
- [x] **5. Las posiciones y las listas.**
      `controlValueAt`, `controlValueOpeningAt` y `controlNameAt` en `position.ts`; el filtro por
      forma en `ts-completion.ts` y el hueco nativo en `plugin.ts`. `reaches` para una lista,
      `accepts` para un enlace — y **la misma** en las dos voces que contestan `control=`.
- [x] **6. El hueco de `control=` en la proyección.**
      `openControlValue` en
      [`template/attrs.ts`](../../../packages/language-core/src/template/attrs.ts), con sus tres
      sitios: elemento nativo, literal de props y `emitEntries`. Y `$control`/`$controlGroup`
      tipados por forma en `globals.ts`, que es la 109 comprobada por TypeScript.
- [x] **7. El hover y la bombilla.**
      Una tarjeta por clase de elemento; `controlBindingSites` + `boundPaths` para ofrecer los
      campos que faltan y ninguno de los que ya están.

## Fase 3 — Lo que no es de `control` (2)

- [x] **8. El `@` con color propio.**
      Quinto tipo `fudAt` sobre **el carácter**, emitido también en valores de atributo;
      `semanticTokenTypes` + `semanticTokenScopes` + `configurationDefaults` por familia de tema
      en `packages/vscode/package.json`.
- [x] **9. El eco de la zona neutra.**
      `USER_ECHO_CAPS` con `navigation` y nada más
      ([`caps.ts`](../../../packages/language-core/src/caps.ts)).

---

## Cierre

- [x] `pnpm typecheck` · `pnpm test` en verde en el workspace entero.
- [x] Cobertura **100 %** en las cuatro métricas de `language-core`, `language-server`, `forms` y
      `vscode`; el código nuevo del compilador al 100 % también.
- [x] Decisiones 108–114 renumeradas en el texto de
      [`gramatica-v1-decisiones.md`](../../gramar/gramatica-v1-decisiones.md) —el índice ya
      estaba en 108–114 y el cuerpo se había quedado en 106–112—, la 109 derogada en su mitad de
      `type` dinámico y la **115** escrita.
- [x] `FUD0595` anotado en el catálogo de [SDD-12](../SDD-12-semantica.md).
- [x] Fila en [el índice de BUG](./INDEX.md) y registro en [INDEX.md](../INDEX.md).
