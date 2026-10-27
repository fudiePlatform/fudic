# Pendiente de implementar

Orden propuesto a 2026-10-27. Todo está en `Listo` en `main`.

## Bugs

| # | Qué | Por qué en este orden |
|---|---|---|
| 1 | [BUG-52](sdd/bugs/BUG-52-tests-que-dependen-del-entorno.md) · [tareas](sdd/bugs/BUG-52-Task.md) | Los 3 tests de la CLI que fallan por los colores. Son 7 tareas y no toca nada más. |
| 2 | [BUG-53](sdd/bugs/BUG-53-precarga-sin-sw-a-medias.md) · [tareas](sdd/bugs/BUG-53-Task.md) | La precarga con el grafo completo. Toca el SW, igual que la 67 y la 70: mejor antes que en paralelo. |

## SDD

| # | SDD | Necesita | Nota |
|---|---|---|---|
| 3 | [67](sdd/SDD-67-binario-y-reglas-en-las-funciones.md) · binario y reglas en las funciones | — | La base de las llamadas. |
| 4 | [68](sdd/SDD-68-llamadas-sin-fontaneria.md) · `task` y repintar sin recargar | 67 | |
| 5 | [69](sdd/SDD-69-sesion-por-cookie.md) · sesión por cookie | 68 (solo el ejemplo) | No necesita la 67, solo cabeceras. Puede ir antes; entonces el ejemplo recarga al entrar y salir hasta la 68. |
| 6 | [70](sdd/SDD-70-await-en-la-vista.md) · `@await` en la vista | 67, 68 | La más grande (unas 45 tareas). |
| 7 | [71](sdd/SDD-71-pipes-del-usuario.md) · pipes del usuario | — | Tras la 70: las dos tocan la gramática del `.fudapi` y el emit. |
| 8 | [62](sdd/SDD-62-diagnosticos-que-dicen-la-verdad.md) · diagnósticos que dicen la verdad | — | Migra el `.md` de todos los códigos: mejor cuando ya existen los de 67–71. |
| 9 | [63](sdd/SDD-63-contrato-del-componente.md) · contrato del componente | — | En paralelo con la 64, o con la cadena 67–70 en otro worktree. |
| 9 | [64](sdd/SDD-64-resultados-legibles.md) · resultados legibles | — | Ídem. |
| 10 | [65](sdd/SDD-65-historial-de-cada-pieza.md) · historial de cada pieza | 63, 64 | |
| 11 | [66](sdd/SDD-66-generadores-que-faltan.md) · generadores que faltan | 67, 70 | La última: sus plantillas de `load` usan `later` y las reglas de los argumentos. Enmienda SDD-61 §3.9, como la 71. |

Después: las SDD del MCP ([IDEA-07](sdd/ideas/IDEA-07-mcp-de-fudic.md)).
