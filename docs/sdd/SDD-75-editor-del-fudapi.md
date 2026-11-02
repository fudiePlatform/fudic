# SDD-75 — El editor del `.fudapi`: snippets, implementaciones y lo generado a un clic

> **Estado:** `Listo` — [tareas](./SDD-75-Task.md).
> **Paquetes:** `@fudic/language-server` · `@fudic/api` · `@fudic/vscode`
> **Depende de:** 60 (el `.fudapi` y su language server), 32 (los CodeLens del `.fudspec`, que se
> imitan), 74 (`catches` en las funciones; `fails` en ellas pero no en `load`; lo generado por idioma) — las tres en `Hecho`.
> **Rango de diagnósticos:** ninguno.
> **Decisiones de gramática:** ninguna.
> **Origen:** conversación con Pedro del 2026-11-01.
> **Rama sugerida:** `sdd-75-editor-del-fudapi`

---

## 1. Qué arregla

- **El `.fudapi` no tiene ni un snippet.** El completado ofrece palabras sueltas, y escribir una
  función, un formulario o una regla empieza siempre desde cero.
- **Desde un `.fudapi` no se ve quién lo implementa.** Un handler que falta solo se descubre al
  ejecutar.
- **Lo generado no se ve sin buscarlo.** El `.d.ts` está en `.fudic/api/<id>.d.ts`, y los
  módulos de servidor y de navegador solo existen dentro de Vite.
- **No hay forma de regenerar a mano.** El language server regenera al guardar y al arrancar,
  pero tras un cambio de rama o un evento de fichero perdido no hay botón de rescate.

---

## 2. Decisiones

- **Los snippets los da el language server, no `contributes.snippets`.** El `.fudapi` depende del
  sangrado: un snippet estático ofrecería `form` en mitad de un campo. El completado ya sabe en qué
  contexto está el cursor (`language-server/src/fudapi/completion.ts`, `contextOf`).
- **Todo es CodeLens, como en el `.fudspec`.** Lo generado y las implementaciones están a un clic
  encima de lo que describen.
- **Un snippet sustituye a la palabra suelta del mismo nombre.** No salen dos entradas `post`.

---

## 3. Interfaz pública

### 3.1. Snippets

Cada snippet es un `CompletionItem` con `kind: Snippet`, `insertTextFormat: Snippet`, `label`
igual a la palabra clave y un `detail` de una línea. Se ofrecen solo en su contexto:

- **Al principio de línea, fuera de toda declaración:**
  - `get`, `post`, `put`, `patch`, `delete`: `post ${1:name}\n  ${2:arg}  ${3:str}$0`
  - `load`: `load ${1|ssr,ssg,isr|}\n  ${2:field}  ${3:str}$0`
  - `form`: `form ${1:name}\n\n  ${2:field}  ${3:str} = ${4:""}\n    required  "${5:Write it.}"$0`
  - `type`: `type ${1:Name}\n  ${2:field}  ${3:str}$0`
  - `enum`: `enum ${1:Name}\n  ${2:value}$0`
  - `rule`: `rule ${1:name}\n  on field ${2:str}\n  runs ${3|both,server|}\n  fails ${4:code}$0`
    (*corregido al implementar:* sin `on field` ni `runs` la regla no valida)
  - `middleware`: `middleware ${1:name}\n  fails ${2:code} ${3:401} "${4:detail}"$0`
  - `pattern`: `pattern ${1:name} "${2:regex}"$0`
  - `pipe`: `pipe ${1:name}\n  on ${2:str}$0`
  - `chain`: `chain\n  use ${1:log}$0`
- **Dentro de una función:** `use ${1}`, `invalidates /${1}`, `catches ${1:409}`,
  `fails ${1:code} ${2:409} "${3:text}"`, `query ${1:name}  ${2:str}`, `-> ${1:Type}`, `form ${1}`.
- **Dentro de un formulario:** `catches ${1:400 409 422}`, `summary\n  ${1}`,
  `validate-on ${1|submit,blur,input|}`.
- **Debajo de un campo de formulario:** cada regla aplicable al tipo del campo, con su texto:
  `required  "${1:text}"`, `min ${1:n}  "${2:text}"`, `max ${1:n}  "${2:text}"`,
  `min-length ${1:n}  "${2:text}"`, `max-length ${1:n}  "${2:text}"`,
  `pattern ${1}  "${2:text}"`. Las reglas del proyecto que admiten el tipo, igual, con sus
  parámetros como tabstops.

Las sangrías del snippet salen del sangrado de la línea donde se acepta.

### 3.2. CodeLens

**En la línea 1 del `.fudapi`**, cuatro lentes:

| Lente | Hace |
|---|---|
| `Types` | Abre `.fudic/api/<id>.d.ts`. Si no existe, lo genera antes. |
| `Server` | Abre de solo lectura lo que da `emitModule(…, 'server')` para este fichero, como `typescript`. |
| `Browser` | Igual con `'browser'`. |
| `Regenerate` | Reescribe ya el `.d.ts` de este fichero y de los que dependen de él, haya cambiado o no. Avisa: `Regenerated N files.` |

Con `i18n`, `Server` y `Browser` muestran lo generado sin `LocaleCompile`: los textos en el idioma
de origen del `.fudapi`, que es lo que el autor escribió. Lo traducido es cosa del build.

**Encima de cada declaración que se implementa** (función, `load`, `paths`, `layout`, regla,
middleware, pipe):

| Caso | Lente |
|---|---|
| Una implementación | `implemented in src/server/usuarios.ts`. El clic lleva a la llamada `.handle(`/`.check(`/`.client(`/`.server(`/`.implement(`. |
| Ninguna | `not implemented`, sin clic. |
| Dos o más | Una lente por fichero. El error de duplicado lo sigue dando el build. |
| Middleware | Una lente por mitad: `client: src/browser/auth.ts` · `server: not implemented`. |

**Encima de cada `type`, `enum`, `form` y `pattern`** (*añadido al implementar, Pedro,
2026-11-02*): lo que genera en los tipos del fichero — `interface Person`, `type Role`,
`const personForm` — y el clic lleva a esa línea de `.fudic/api/<id>.d.ts`. Si los tipos no la
tienen, no sale lente.

### 3.3. Comandos de VS Code

`fudic.api.showTypes`, `fudic.api.showServer`, `fudic.api.showBrowser`, `fudic.api.regenerate` y
`fudic.api.goToImplementation`. Los cuatro primeros también en la paleta, con
`when: editorLangId == fudapi` y título `Fudic: …`.

---

## 4. Comportamiento

### 4.1. Snippets

- Salen en el mismo `apiCompletions` que hoy, según el `Context` que ya calcula. Donde había una
  palabra suelta con el mismo nombre, sale el snippet en su lugar.
- Dentro de un texto entre comillas no sale ninguno.
- `fails` se ofrece dentro de una función (como snippet), de una regla y de un middleware, y no
  dentro de `load` (SDD-74, decisión 175).

### 4.2. Implementaciones

- El language server mira los `.ts`/`.js` de `src/server/**`, `src/browser/**` y la carpeta de
  pipes del proyecto (`src/pipes/**` o la `pipes` de su `fudic.json`); en una librería, sus
  carpetas `server/` y `browser/`. Para cada uno busca, con un único parseo de Oxc:
  - un `import { x } from 'fudic:<id>'`;
  - una llamada `x.handle(…)`, `x.check(…)`, `x.client(…)`, `x.server(…)` o, en un pipe,
    `x.implement(…)` sobre ese nombre.
- El resultado se guarda en un índice por `<id>` y nombre, con el fichero y el span de la
  llamada.
- El índice se actualiza cuando cambia, se crea o se borra un fichero de esas carpetas.
  `FILE_EVENTS` de la extensión añade `**/src/server/**`, `**/src/browser/**` y `**/src/pipes/**`.
- Un fichero que no parsea no aporta nada y no rompe el índice.
- *Añadido al implementar (Pedro, 2026-11-02):* los pipes, que se implementan con `.implement(`
  junto a su contrato. Y el `.fudapi` propio de una librería (`fudapi/` de su paquete) tiene el
  `<id>` con que lo importan sus apps y sus scripts (`@fudic/forms/rules`); abierto desde los
  `node_modules` de una app, sus tipos son los de esa app (`.fudic/api/@fudic/forms/rules.d.ts`).

### 4.3. Lo generado

- `Server` y `Browser` usan el proveedor de documentos virtuales que ya existe
  (`vscode/src/virtual-doc-provider.ts`). Si el `.fudapi` cambia con el documento abierto, el
  contenido se refresca.
- Con errores de parser o validador en el `.fudapi`, las lentes de lo generado se muestran igual
  y abren lo que se generó la última vez que el fichero estaba bien. Si nunca lo estuvo, avisan:
  `This file has errors; nothing has been generated yet.`

---

## 5. Criterios de aceptación

1. **Snippet en la raíz.** En una línea vacía al principio del fichero, el completado trae
   `post` como snippet con el texto de §3.1, y una sola entrada `post`.
2. **Snippet fuera de sitio.** Debajo de un campo de formulario no sale `post`. Dentro de una
   función no sale `form` de raíz (sí `form ${1}` de función).
3. **Reglas por tipo.** Debajo de un campo `u8` sale `min`; debajo de uno `bool`, no. Una regla del
   proyecto `on str` sale debajo de un campo `str`, con sus parámetros como tabstops.
4. **Sangrado.** Un snippet aceptado con la línea sangrada a 2 deja sus líneas interiores a 4.
5. **Comillas.** Dentro de `"…"` no sale ningún snippet.
6. **`catches` y `fails`.** Dentro de una función salen `catches` y `fails` como snippets; dentro
   de `load`, ninguno de los dos.
7. **Lentes de la línea 1.** Un `.fudapi` sin errores tiene `Types`, `Server`, `Browser` y
   `Regenerate` en la línea 1.
8. **`Types`.** Abre `.fudic/api/<id>.d.ts`. Si se borró, lo regenera y lo abre.
9. **`Server` y `Browser`.** Su contenido es exactamente lo que da `emitModule` para ese lado.
   Tras editar y guardar el `.fudapi`, el documento abierto muestra lo nuevo.
10. **`Regenerate`.** Con el `.d.ts` borrado o editado a mano, lo reescribe, junto con los de los
    `.fudapi` que dependen de este, y avisa con el número de ficheros.
11. **Implementada.** Con `save.handle(…)` en `src/server/usuarios.ts`, encima de `post save` sale
    `implemented in src/server/usuarios.ts`, y el clic lleva al `.handle(`.
12. **Sin implementar.** Al borrar esa llamada, la lente pasa a `not implemented` sin reiniciar el
    language server.
13. **Duplicada.** Con dos ficheros que implementan `save`, salen dos lentes.
14. **Middleware.** `auth` con solo la mitad de cliente: `client: src/browser/auth.ts` ·
    `server: not implemented`.
15. **Fichero roto.** Un `.ts` de `src/server` con un error de sintaxis no tumba el índice. Las
    demás lentes siguen bien.
16. **Con errores.** Un `.fudapi` con un error de parser enseña las lentes de la línea 1. Si nunca
    generó nada, avisan con el mensaje de §4.3.
17. **Comandos.** Los cinco están registrados; los cuatro de la paleta solo salen con un
    `.fudapi` activo.
18. **Cobertura.** El código nuevo de `language-server` y `vscode` queda al 100 % en las cuatro
    métricas, y ningún paquete tocado baja de su umbral.
