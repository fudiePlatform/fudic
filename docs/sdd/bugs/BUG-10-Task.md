# BUG-10 — Tareas

> **BUG:** [BUG-10 — Las URL de dev solo existen para el middleware, y el pre-transform de Vite no lo sabe](./BUG-10-url-de-dev-sin-resolver.md)
> **Paquete:** `@fudic/vite` · **Rama:** ninguna, directo a `main`
> **Depende de:** nada
> **Progreso:** 6 / 6

Cada tarea es un paso cerrado. Las rutas son relativas a la raíz del repo.

El orden manda en un punto: **la tarea 1 antes que la 3**. El test tiene que verse fallar con
el mensaje literal del síntoma; escrito después del arreglo, solo demostraría que el arreglo
hace lo que hace.

---

## Fase 1 — Rojo primero (2)

- [x] **1. `transformRequest` de la URL del bootstrap lanza.**
      En `packages/vite/test/dev.test.ts`, sobre el servidor de dev que ya monta el fichero:
      `server.transformRequest('/fudic-main.js')` rechaza con `Failed to load url`. **Verlo
      fallar hoy** — es el camino que Vite recorre al precalentar, y el que el navegador nunca
      toma (§6.1).
- [x] **2. El síntoma, en el ejemplo.**
      `pnpm dev` en `examples/basic`, pedir `/` y `/about`, y anotar la línea
      `Pre-transform error: Failed to load url /fudic-main.js` tal cual sale. Es la línea que
      §6.5 exige que desaparezca.

## Fase 2 — Una sola traducción, dos consumidores (2)

- [x] **3. `DEV_SCRIPT_IDS`.**
      Mapa único URL (sin `base`) → id virtual, construido sobre `DEV_MAIN_URL` y
      `DEV_SW_URL` de `packages/vite/src/constants.ts`. Con el porqué escrito al lado: el
      warmup no pasa por los middlewares (§2.1).
- [x] **4. `resolveId` consulta el mapa.**
      `packages/vite/src/plugin.ts:395-403`: tras los ids virtuales, si `isDev`, traducir
      `pathnameOf(id, base)` por el mapa (§4.1, §4.2, §4.3). En build no, porque ahí esos dos
      nombres son ficheros emitidos de verdad.
      Verde en 1; **el resto de `dev.test.ts` tiene que seguir verde**.

## Fase 3 — Lo que no se puede romper (2)

- [x] **5. El mapa no es un comodín.**
      `/nope.js` sigue cayendo al resolutor de Vite y sigue fallando (§6.3). Y `/fudic-sw.js`
      resuelve, que es la otra mitad de la causa (§6.2, §2.3).
- [x] **6. Extremo a extremo.**
      `pnpm dev` en `examples/basic` con el arreglo: páginas servidas, `/fudic-main.js` con su
      contenido, y el log **sin ninguna** línea de `Pre-transform error` (§6.5).

---

## Cierre del BUG

- [x] `pnpm typecheck` y `pnpm test` de `@fudic/vite` en verde (252 tests, 37 ficheros).
- [x] La cobertura de `@fudic/vite` no baja respecto a `main`.
- [x] Marcar BUG-10 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [x] Anotar en [SDD-20 §4.11](../SDD-20-render-sw.md) que las URL de dev las conocen el
      middleware **y** el `resolveId`, con enlace a este BUG.
