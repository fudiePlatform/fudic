# El MCP de Fudic en la web

Plan de la sección MCP de la web pública: qué cuenta, a quién, en qué grupos de páginas y dónde
vive el código. Es la opción «MCP» del menú de [hero.html](../hero.html). Rama de trabajo:
`web-publica`. El plan general de la web está en [../README.md](../README.md).

## 1. Qué es

El MCP está hecho para máquinas, pero esta sección se escribe **para personas**: para quien va a
construir con un modelo (Claude, Copilot, Gemini, Codex…) y quiere saber qué le da el MCP, cómo
conectarlo y, sobre todo, **cómo dirigir al modelo** para que construya bien. Sin dejar de ser la
referencia completa: cada herramienta, qué hace, qué recibe y qué responde.

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
- **Lo ves dentro de la conversación.** Una pieza se pinta en el chat; la app entera se abre en una
  URL, también desde el móvil.

### Para quién

1. **Quien empieza con Fudic y con un chat** (Claude en la web): no ha instalado nada más que el
   proyecto, y quiere que el chat construya con él, paso a paso.
2. **Quien trabaja con un agente en su editor** (Claude Code, Copilot en VS Code, Cursor,
   Antigravity, Windsurf, Codex, Gemini CLI): quiere conectarlo y saber qué le va a pedir el agente.
3. **Quien ya conoce otro framework y forma equipos** con IA: quiere entender el método (fases,
   aprobaciones, historial) para exigirlo.

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
  cuando la petición es vaga. El prompt `new-app` del menú del chat arranca esto solo.
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
| 1 | **Qué es el MCP** | Una portada: qué es MCP (el estándar abierto, citado), por qué un modelo necesita el de Fudic, lo que hace en una frase por idea (§1), agente o chat, y por dónde seguir. | Por escribir |
| 2 | **Dirigir un modelo** | Cuatro páginas: El reparto de papeles (tú, el modelo, el MCP), Las fases de una pieza (una por una, quién habla en cada una), Aprobar, caducar y reabrir (`approved`, `look`, `accepted`, `reopened`, `done`) y Una conversación de principio a fin (de «quiero una librería» a la primera pieza `done`, real, con sus capturas). | Por escribir |
| 3 | **Conectarlo** | Una página por entorno: Claude Code, VS Code (Copilot), Cursor, Antigravity, Windsurf, Codex, Gemini CLI y Claude en la web (HTTP, túnel y conector). Cada una con su fichero de configuración tal cual, dónde va y cómo se comprueba que está conectado. Y Otros clientes: stdio, `--http`, `--port`. | Por escribir |
| 4 | **Lo que genera la CLI** | `fudic new` lo deja listo: `@fudic/mcp` en `devDependencies`, `.mcp.json`, `AGENTS.md` (el estándar que leen Codex, Copilot, Cursor, Antigravity…) y `CLAUDE.md`, que solo dice `@AGENTS.md` para que Claude Code lea el mismo fichero. Qué añadir a `AGENTS.md` y qué no. Las `instructions` que el servidor manda al modelo, línea a línea. Un proyecto creado antes: `pnpm add -D @fudic/mcp`. | Por escribir |
| 5 | **Ver lo que se construye** | Una pieza (`fudic_render`: su esquema accesible, su HTML, en un navegador real; en el chat, la pieza dibujada con MCP Apps), La app entera (`fudic_preview`, la puerta con cookie, abrirla en el móvil, HMR), El aspecto (`fudic_look`: `new`, `same`, `changed`, `gone`, el hash de lo que dibuja) y Llamar al servidor (`fudic_call`). | Por escribir |
| 6 | **Seguridad** | El secreto de la URL (`.fudic/mcp/secret`, `--new-secret`), solo `127.0.0.1`, lo que trae el túnel, que no ejecuta comandos del chat, la raíz del proyecto como único sitio que lee y escribe, y las capturas tras su token. | Por escribir |
| 7 | **Las herramientas** | Una página de grupo con las 21 herramientas y la forma común de la respuesta (versión, commit, diagnósticos con `fichero:línea:columna`, `next`). Fuera del menú, **una página por herramienta**, como los comandos de la CLI: qué hace, sus argumentos, una llamada y su respuesta reales, cuándo la usa el modelo y sus códigos. | Por escribir |
| 8 | **La guía del modelo** | Lo que lee el modelo: los diez temas de `fudic_guide` (`overview`, `components`, `pages`, `view`, `fudapi`, `fudspec`, `testing`, `html-css`, `workflow`, `config`), qué cuenta cada uno y su enlace a la Documentación; un código de diagnóstico explicado; el prompt `new-app`; el recurso `ui://fudic/view.html`. | Por escribir |
| 9 | **Workspaces** | El MCP en la raíz de un workspace (cada app y librería por separado, como su build) o en la carpeta de una app (para sus funciones del `.fudapi`); la librería con showcase y la página de error compartida. | Por escribir |

### 3.1 Las herramientas, agrupadas

El grupo 7 las ordena por lo que hacen, no por orden alfabético:

| Grupo | Herramientas |
|---|---|
| Orientarse | `fudic_status`, `fudic_guide` |
| Crear | `fudic_new`, `fudic_generate`, `fudic_add` |
| Comprobar y corregir | `fudic_check`, `fudic_fix`, `fudic_format` |
| Conocer el proyecto | `fudic_symbols`, `fudic_describe`, `fudic_contract` |
| Probar | `fudic_test`, `fudic_spec_run` |
| Ver | `fudic_render`, `fudic_preview`, `fudic_look`, `fudic_call` |
| Decidir | `fudic_record` |
| Ficheros (solo por HTTP) | `fudic_files`, `fudic_read`, `fudic_write` |

Sale del código de `packages/mcp` (`server.ts`, `project-tools.ts`, `file-tools.ts`), de su
README y de su guía (`packages/mcp/guide`). Cada llamada y cada respuesta citadas son de una
ejecución real.

### 3.2 Los entornos

Cada página de «Conectarlo» se comprueba contra la documentación oficial del entorno en el momento
de escribirla (enlace en otra pestaña) y, donde se pueda, conectándolo de verdad. Los formatos no
son iguales: `.mcp.json` con `mcpServers` en Claude Code, `.vscode/mcp.json` con `servers` en VS
Code, la configuración de cada IDE en Cursor, Antigravity y Windsurf, `config.toml` en Codex… Lo
que no funcione tal como lo deja `fudic new` se apunta en los hallazgos.

## 4. Requisitos

Los mismos que la web (§3 del plan general): SEO impecable, WCAG 2.2 AA, modo claro y oscuro.
Además, por ser una sección sobre máquinas:

- **Legible por máquinas también.** Propuesta para decidir: un `llms.txt` en la raíz de la sección
  y cada página servida también como Markdown, para que un modelo pueda leer esta documentación sin
  pasar por el MCP.
- **Nada inventado.** Cada configuración, llamada y respuesta, copiada de una ejecución real.

## 5. Dónde vive el código

Una app nueva del workspace `web/`, creada con la CLI y sobre la misma librería `ui` (layout,
nav, scroll spy, tokens), como prevé el plan general (§6):

```sh
fudic g app mcp --uses ui
```

```
web/
├── apps/
│   ├── site/   la portada y la Documentación
│   └── mcp/    esta sección (prefijo por decidir)
└── libs/
    ├── ui/     lo compartido, sin copiar nada
    └── guide/
```

Por decidir con Pedro:

- **La URL:** `fudic.dev/mcp` (una ruta bajo el mismo dominio, que el servidor reparte a la app) o
  `mcp.fudic.dev` (un subdominio propio).
- **El prefijo de sus componentes.**
- **Si el `llms.txt` y las páginas en Markdown** entran en la primera versión (§4).

Todo lo que la CLI no resuelva al crear la app se apunta en
[../hallazgos-cli.md](../hallazgos-cli.md); lo del framework, en
[../hallazgos-fudic.md](../hallazgos-fudic.md).

## 6. Orden de trabajo

1. Este documento, validado por Pedro.
2. Crear la app `mcp` con la CLI y llevar el enlace «MCP» del menú hasta ella.
3. Qué es el MCP y Dirigir un modelo (grupos 1 y 2): lo que más importa, primero.
4. Conectarlo y Lo que genera la CLI (grupos 3 y 4), comprobando cada entorno.
5. Ver lo que se construye, Seguridad y Workspaces (grupos 5, 6 y 9).
6. Las herramientas y La guía del modelo (grupos 7 y 8): la referencia.

Igual que la Documentación desde su capítulo 3: notas breves en el chat, Pedro añade lo que falta y
se escribe directamente el HTML.

## 7. Registro

| Fecha | Qué |
|---|---|
| 2026-11-23 | Este documento, para revisión. |
