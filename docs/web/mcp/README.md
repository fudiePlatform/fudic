# El MCP de Fudic en la web

Plan de la sección MCP de la web pública: qué cuenta, a quién, en qué grupos de páginas y dónde
vive el código. Es la opción «MCP» del menú de [hero.html](../hero.html). Rama de trabajo:
`web-publica`. El plan general de la web está en [../README.md](../README.md).

## 1. Qué es

El MCP está hecho para máquinas, pero esta sección se escribe **para personas**: para quien va a
construir con un agente (Claude Code, Copilot, Cursor, Antigravity, Codex, Gemini…) o desde un chat
(Claude en la web) y quiere saber
qué le da el MCP, cómo conectarlo y, sobre todo, **cómo dirigir al modelo** para que construya bien.
Sin dejar de ser la referencia completa: cada herramienta, qué hace, qué recibe y qué responde.

Por eso tiene su propia app y su propio menú, separados de la Documentación. La Documentación
explica Fudic; esta sección explica **cómo construir Fudic con una IA**. Las dos se enlazan, nunca
se repiten: donde el MCP habla de un `.fudspec`, de un `.fudapi` o de un diagnóstico, enlaza a su
página de la Documentación.

### Lo que hay que contar, en una frase por idea

- **Un modelo no conoce Fudic.** Conoce React, Angular, Vue o Svelte porque los vio al entrenarse;
  Fudic no. Y Fudic se parece lo justo para que el modelo escriba de memoria algo que *casi*
  funciona: HTML y CSS estándar, Declarative Shadow DOM, Razor adaptado a TypeScript, delegación de
  eventos, pub/sub… El MCP le dice desde la primera línea que no escriba nada por analogía.
- **El MCP le enseña Fudic desde el proyecto.** La guía (diez temas y cada código de diagnóstico)
  viaja con el paquete, y el MCP comprueba, compila y ejecuta con **el Fudic que tiene instalado el
  proyecto**: lo que dice es lo que dirá el build, no lo que el modelo recuerda.
- **Crea con las mismas herramientas que la CLI.** `fudic_generate` es `fudic g`: la misma carpeta,
  el mismo tag, el test, el `.fudspec` y su fixture. El modelo edita lo que se crea; no inventa la
  estructura.
- **Siempre sabe cuál es el siguiente paso.** `fudic_status` lee los ficheros, el historial de cada
  pieza y los diagnósticos, y responde con `next`: una sola cosa que hacer.
- **No dice «listo»: lo demuestra.** Cada pieza pasa por fases (criterios, rojo, vista, aspecto…) y
  ninguna se da por hecha sin sus tests y sus criterios en verde.
- **Tú decides, el modelo construye.** Hay cosas que solo aprueba la persona —los criterios, el
  aspecto de un componente, que el cliente lo aceptó— y el MCP no deja que el modelo las apruebe por
  ella.
- **Lo ves antes de aprobarlo.** Una pieza se pinta sola (su esquema accesible, su HTML o una
  captura de un navegador real) y, en un chat, dentro de la conversación; la app entera se abre en
  una URL.
- **Solo toca el proyecto.** Lee y escribe únicamente la carpeta en la que arranca, y los únicos
  comandos que ejecuta son los de un plan de Fudic (`pnpm install` tras `fudic_new` o `fudic_add`).

### Para quién

1. **Quien trabaja con un agente en su editor o su terminal** (Claude Code, Copilot en VS Code,
   Cursor, Antigravity, Windsurf, Codex, Gemini CLI): quiere conectarlo y saber qué le va a pedir el
   agente.
2. **Quien empieza con Fudic desde un chat** (Claude en la web): no tiene un agente en su editor y
   quiere que el chat construya con él, paso a paso, y le enseñe lo que hace.
3. **Quien ya conoce otro framework y forma equipos** con IA: quiere entender el método (fases,
   aprobaciones, historial) para exigirlo.

### El chat: qué se cuenta y qué no

El chat se cuenta entero **en lo que el usuario ve**: que se puede construir desde una
conversación, que el MCP trae entonces sus propias herramientas de ficheros (`fudic_files`,
`fudic_read`, `fudic_write`), que cada pieza se dibuja dentro de la conversación (MCP Apps) y que la
app se abre en una URL, también desde el móvil.

Lo que **no se detalla** es cómo llega el chat al proyecto: el túnel, el secreto de la URL, los
puertos y la puerta con cookie de `fudic_preview`. Hoy es un túnel de Cloudflare para probar, y
cambiará cuando la infraestructura esté montada. Las páginas dicen que existe y que se explicará
entonces, sin comandos ni pasos que luego haya que retirar.

## 2. Cómo dirigir un modelo con el MCP

Es la parte que no existe en ningún otro sitio, y la que más pesa en la sección. La idea central:
**el MCP no sustituye a la persona, le da el volante**. El modelo propone y construye; el MCP marca
el camino y comprueba; la persona aprueba.

| Quién | Qué hace |
|---|---|
| **Tú** | Dices qué quieres, respondes a sus preguntas, apruebas los criterios y el aspecto, dices cuándo el cliente lo aceptó y cuándo hay que reabrir algo. |
| **El modelo** | Pregunta, propone, crea con `fudic_generate`, escribe, comprueba y corrige hasta cero diagnósticos, ejecuta tests y criterios, te enseña lo que ha hecho. |
| **El MCP** | Le enseña Fudic (`fudic_guide`), le dice el siguiente paso (`fudic_status`), comprueba lo que escribe (`fudic_check`), ejecuta las pruebas y apunta en el historial lo que pasa. |

Lo que hay que enseñar con ejemplos de conversación reales:

- **Pedir.** «Quiero una librería de componentes: Button, Card, Input». El modelo no construye los
  tres: pregunta primero por el Button (props, tipos, valores por defecto, comportamiento) y propone
  cuando la petición es vaga. El prompt `new-app` del MCP (en el menú del chat, o como orden en
  el agente) arranca esto solo.
- **Las fases de una pieza**, en el orden en que pasan: `criteria` → `api` → `red` → `view` →
  `connect` → `document` → `showcase` → `look` → `done`. Qué hace el modelo en cada una y en cuáles
  te toca hablar a ti.
- **Aprobar.** Los criterios y su fixture se aprueban juntos; el aspecto, después de ver el antes y
  el después de `fudic_look`. Solo cuenta lo que dices tú en la conversación.
- **Ver no es aprobar.** `fudic_render`, `fudic_preview` y `fudic_look` enseñan; solo
  `fudic_record` escribe en el historial.
- **La aprobación caduca.** Si cambia el `.fudspec` o su fixture, el modelo tiene que enseñarte qué
  cambió y volver a preguntar. Si cambian los ficheros que dibujan el componente, el aspecto caduca y
  la pieza se reabre.
- **Rojo por la razón correcta.** Antes de la vista, los tests y los criterios fallan porque el
  componente aún no lo hace, no porque estén rotos. Por qué esto importa al leer lo que hace el
  modelo.
- **Los tests son el juez.** En la fase de vista el modelo no toca tests ni criterios; si uno está
  mal, te lo dice. Cambiar un criterio es una aprobación nueva.
- **Antes del primer componente, los tokens.** Los colores, espacios y tipografías se acuerdan
  contigo: todos los componentes los leen.
- **Cuando el modelo se desvía.** Qué pedirle: «llama a `fudic_status`», «lee la guía de
  `components`», «describe el componente antes de usarlo». Qué significa que te pida algo que no
  quieres, y cómo decirle que no.
- **El historial.** El `.fudlog` de cada pieza dice quién aprobó qué y cuándo, y qué ejecuciones
  pasaron. Nunca se escribe a mano. Cómo leerlo con `fudic history`.

## 3. Grupos de páginas

Mismo diseño que la Documentación (§2 del plan general): nav a la izquierda, página en el centro,
scroll spy a la derecha. Cada grupo es una entrada del menú; la columna «Páginas» es una propuesta
para validar.

| # | Grupo | Páginas | Estado |
|---|---|---|---|
| 1 | **Qué es el MCP** | Una portada: qué es MCP (el estándar abierto, citado), por qué un modelo necesita el de Fudic, lo que hace en una frase por idea (§1), lo único que toca y por dónde seguir. | Por escribir |
| 2 | **Dirigir un modelo** | Cuatro páginas: El reparto de papeles (tú, el modelo, el MCP), Las fases de una pieza (una por una, quién habla en cada una), Aprobar, caducar y reabrir (`approved`, `look`, `accepted`, `reopened`, `done`) y Una conversación de principio a fin (de «quiero una librería» a la primera pieza `done`, real, con sus capturas). | Por escribir |
| 3 | **Conectarlo** | Una página por entorno: Claude Code, VS Code (Copilot), Cursor, Antigravity, Windsurf, Codex y Gemini CLI. Cada una con su fichero de configuración tal cual, dónde va y cómo se comprueba que está conectado. Otros clientes: cualquiera que arranque un servidor MCP por stdio. Y Desde un chat: lo que cambia (las herramientas de ficheros, la pieza en la conversación, la app en una URL), sin el detalle de cómo se conecta (§1). | Por escribir |
| 4 | **Lo que genera la CLI** | `fudic new` lo deja listo: `@fudic/mcp` en `devDependencies`, `.mcp.json`, `AGENTS.md` (el estándar que leen Codex, Copilot, Cursor, Antigravity…) y `CLAUDE.md`, que solo dice `@AGENTS.md` para que Claude Code lea el mismo fichero. Qué añadir a `AGENTS.md` y qué no. Las `instructions` que el servidor manda al modelo, línea a línea. Un proyecto creado antes: `pnpm add -D @fudic/mcp`. | Por escribir |
| 5 | **Ver lo que se construye** | Una pieza (`fudic_render`: su esquema accesible, su HTML, una captura en un navegador real; en un chat, la pieza dibujada en la conversación), La app entera (`fudic_preview`, el servidor de desarrollo con HMR; en un chat, una URL que se abre también en el móvil), El aspecto (`fudic_look`: `new`, `same`, `changed`, `gone`, el hash de lo que dibuja) y Llamar al servidor (`fudic_call`). | Por escribir |
| 6 | **Las herramientas** | Una página de grupo con las 21 herramientas y la forma común de la respuesta (versión, commit, diagnósticos con `fichero:línea:columna`, `next`). Fuera del menú, **una página por herramienta**, como los comandos de la CLI: qué hace, sus argumentos, una llamada y su respuesta reales, cuándo la usa el modelo y sus códigos. | Por escribir |
| 7 | **La guía del modelo** | Lo que lee el modelo: los diez temas de `fudic_guide` (`overview`, `components`, `pages`, `view`, `fudapi`, `fudspec`, `testing`, `html-css`, `workflow`, `config`), qué cuenta cada uno y su enlace a la Documentación; un código de diagnóstico explicado; el prompt `new-app`; el recurso `ui://fudic/view.html` con el que un chat dibuja una pieza. | Por escribir |
| 8 | **Workspaces** | El MCP en la raíz de un workspace (cada app y librería por separado, como su build) o en la carpeta de una app (para sus funciones del `.fudapi`); la librería con showcase y la página de error compartida. | Por escribir |

### 3.1 Las herramientas, agrupadas

El grupo 6 las ordena por lo que hacen, no por orden alfabético:

| Grupo | Herramientas |
|---|---|
| Orientarse | `fudic_status`, `fudic_guide` |
| Crear | `fudic_new`, `fudic_generate`, `fudic_add` |
| Comprobar y corregir | `fudic_check`, `fudic_fix`, `fudic_format` |
| Conocer el proyecto | `fudic_symbols`, `fudic_describe`, `fudic_contract` |
| Probar | `fudic_test`, `fudic_spec_run` |
| Ver | `fudic_render`, `fudic_preview`, `fudic_look`, `fudic_call` |
| Decidir | `fudic_record` |
| Ficheros (solo desde un chat) | `fudic_files`, `fudic_read`, `fudic_write` |

Sale del código de `packages/mcp` (`server.ts`, `project-tools.ts`, `file-tools.ts`), de su README y de su guía
(`packages/mcp/guide`). Cada llamada y cada respuesta citadas son de una ejecución real.

### 3.2 Los entornos

Cada página de «Conectarlo» se comprueba contra la documentación oficial del entorno en el momento
de escribirla (enlace en otra pestaña) y, donde se pueda, conectándolo de verdad. Los formatos no
son iguales: `.mcp.json` con `mcpServers` en Claude Code, `.vscode/mcp.json` con `servers` en VS
Code, la configuración de cada IDE en Cursor, Antigravity y Windsurf, `config.toml` en Codex… Lo
que no funcione tal como lo deja `fudic new` se apunta en los hallazgos.

## 4. Requisitos

Los mismos que la web (§3 del plan general): SEO impecable, WCAG 2.2 AA, modo claro y oscuro.
Y **nada inventado**: cada configuración, llamada y respuesta, copiada de una ejecución real.

## 5. Dónde vive el código

Una **subapp del mismo dominio**: `fudic.dev/mcp`, una app nueva del workspace `web/` creada con
la CLI. **No tiene componentes propios**: usa los de la librería `ui` (layout, nav, scroll spy,
código, notas, tokens), como prevé el plan general (§6).

```sh
fudic g app mcp --uses ui
```

```
web/
├── apps/
│   ├── site/   fudic.dev: la portada y la Documentación
│   └── mcp/    fudic.dev/mcp: esta sección
└── libs/
    ├── ui/     los componentes de las dos, sin copiar nada
    └── guide/
```

Todo lo que la CLI no resuelva al crear la app (por ejemplo, servirla bajo `/mcp` del mismo
dominio) se apunta en [../hallazgos-cli.md](../hallazgos-cli.md); lo del framework, en
[../hallazgos-fudic.md](../hallazgos-fudic.md).

## 6. Orden de trabajo

1. Este documento, validado por Pedro.
2. ~~Crear la app `mcp` con la CLI y llevar el enlace «MCP» del menú hasta ella.~~
3. Qué es el MCP y Dirigir un modelo (grupos 1 y 2): lo que más importa, primero.
4. Conectarlo y Lo que genera la CLI (grupos 3 y 4), comprobando cada entorno.
5. Ver lo que se construye y Workspaces (grupos 5 y 8).
6. Las herramientas y La guía del modelo (grupos 6 y 7): la referencia.
7. Al final, con `robots.txt` y `sitemap.xml`: el `llms.txt` (§7).

Igual que la Documentación desde su capítulo 3: notas breves en el chat, Pedro añade lo que falta y
se escribe directamente el HTML.

## 7. Pendiente para el final: `llms.txt`

Decidido, pero **no se hace ahora**: va junto a `robots.txt` y `sitemap.xml`, al final de la web.

- [ ] `fudic.dev/llms.txt`, con el formato de [llmstxt.org](https://llmstxt.org/): el nombre, un
      resumen de Fudic y una lista de enlaces por capítulo, cada uno con su descripción.
- [ ] Generado, no escrito a mano: el orden y los capítulos salen del nav de `libs/ui`
      (`docsNav`), y el título y la descripción, del `<title>` y el `<meta name="description">`
      de cada página. Así no se desfasa. Hoy serían 18 capítulos y 93 páginas de la Documentación,
      más las del MCP.
- [ ] Las páginas del MCP en su propia sección, y las páginas de comandos y de herramientas, que no
      están en el menú, en la sección `Optional`.
- [ ] Cada página servida también en Markdown (`.md` junto a su URL), para que un modelo lea la
      documentación sin pasar por el HTML; el `llms.txt` enlaza a esas versiones.
- [ ] Revisar las descripciones que llevan entidades HTML (`&#64;`) para que salgan como texto.

## 8. Registro

| Fecha | Qué |
|---|---|
| 2026-11-23 | Este documento, para revisión. |
| 2026-11-23 | Decisiones de Pedro: fuera el túnel y el chat (no se documentan); subapp en `fudic.dev/mcp`; sin componentes propios, los de `ui`; el `llms.txt`, al final con `robots.txt` y `sitemap.xml`. |
| 2026-11-23 | Corrección de Pedro: el chat **sí** se cuenta (herramientas de ficheros, la pieza en la conversación, la app en una URL); lo que no se detalla es cómo se conecta (túnel, secreto, puertos), porque cambiará con la infraestructura. Vuelven las 21 herramientas. |
| 2026-11-23 | Plan validado. App `web/apps/mcp` creada con `fudic g app mcp --uses ui --layout @web/ui/layouts/docs.fud --no-sw`, servida en `/mcp/`. Dentro del monorepo la CLI no pudo (hallazgos 5 y 6 de la CLI): se creó sobre una copia de `web/` y se trajo. «MCP» en la cabecera de todas las páginas y `mcpNav` en `ui`. La portada, solo con su cabecera, a la espera de las notas de los grupos 1 y 2. |
| 2026-11-23 | Conversación real grabada para «Una conversación de principio a fin», en [conversacion/](conversacion/README.md): un Claude Code nuevo construye `<tienda-button>` con el MCP, de la petición a `done`, en seis turnos (unos 8,8 $). Proyecto de prueba creado con `fudic new` e instalado desde el Verdaccio local. Hallazgo 47 del framework (el diff vacío de una aprobación caducada, un `next` que habla de criterios en verde, una ejecución parcial que cuenta como el estado de la pieza, y el agente que no empezó por `fudic_status`). |
