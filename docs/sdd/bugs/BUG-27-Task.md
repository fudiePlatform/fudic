# BUG-27 — Tareas

> **BUG:** [BUG-27 — Una signal que vive en un módulo no avisa nunca](./BUG-27-signal-de-modulo-sin-suscribir.md)
> **Paquetes:** `@fudic/core` · `@fudic/compiler`
> **Rama:** `worktree-reactividad-evidencias` · **Depende de:** SDD-31 y SDD-15 en `Hecho`
> **Progreso:** 4 / 4 — `Hecho`

Cuatro tareas. Rutas relativas a la raíz del repo.

**El orden manda:** el **canal antes que el emit** (1 y 2 antes que 3). El emit escribe una
llamada a `subscribeIf`, así que tiene que existir y estar probada antes de que nadie la
escriba — y el punto entero del canal es que **no llame** a lo que recibe, que es justo lo que
un emit sin canal correcto haría.

---

## Mapa de dependencias

```
A · el canal (@fudic/core)
   1 la marca `SOURCE` ──→ 2 `subscribeIf`
                                │
B · el emit (@fudic/compiler)   │
   3 `clientImports` + `$subIf` ┘
C · la evidencia
   4 el store del ejemplo y la suite de navegador
```

---

## Fase 1 — El canal (2)

- [x] **1. La marca que distingue una fuente de un ayudante.**
      `SOURCE`, `tagSource` e `isSource` en
      [`core/src/tracking.ts`](../../../packages/core/src/tracking.ts); `tagLeaf` marca las
      dos cosas y `computed` estrena marca
      ([`computed.ts`](../../../packages/core/src/computed.ts)), porque un derivado no tiene
      hoja propia y aun así se puede observar. `leafOf` responde *qué hoja hay detrás*;
      `isSource`, la pregunta más débil que plantea un nombre importado.
- [x] **2. `subscribeIf`.**
      [`core/src/subscribe.ts`](../../../packages/core/src/subscribe.ts) y su export en
      `index.ts`. La prueba va **antes** de llamar a `subscribe`, no como guarda posterior, y
      la rama inerte devuelve una baja llamable: el chunk mete todas en `$d` y las llama en
      `r()`.

## Fase 2 — El emit (1)

- [x] **3. Los nombres importados, por el canal guardado.**
      `importedBindings` en
      [`emit/oxc-code.ts`](../../../packages/compiler/src/emit/oxc-code.ts), leído de
      **todas** las sentencias de `@code` y no solo de `@client` —la zona neutra es donde un
      store tiene que vivir para que la ruta prerenderice—, con los `type` y `@fudic/*`
      fuera. `CoreUsage.guarded` y las dos líneas de import en
      [`emit/client.ts`](../../../packages/compiler/src/emit/client.ts): cada canal trae solo
      su nombre.

## Fase 3 — La evidencia (1)

- [x] **4. El store del ejemplo.**
      [`src/store/contador.ts`](../../../examples/basic/src/store/contador.ts) y
      `<signal-store>`, **dos veces** en la página: la arista que ni un bus dirige ni una prop
      alcanza son dos hermanos. El botón de «forzar repintado» se queda, y no es decoración —
      es lo que enseña que el valor era correcto y el aviso no llegaba.

---

## Cierre

- [x] `pnpm typecheck` · `pnpm test` en verde en el workspace entero.
- [x] `@fudic/core` al **100 %** en las cuatro métricas, sin `/* v8 ignore */`.
- [x] Validado por mutación: se deshace el canal y caen los tests del emit y los del store.
- [x] [SDD-31 §3.1](../SDD-31-signals-derivadas.md) anotado con `subscribeIf` y con la razón
      de que sea un canal aparte.
- [x] Fila en [el índice de BUG](./INDEX.md) y registro en [INDEX.md](../INDEX.md).
