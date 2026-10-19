/**
 * The server of `/usuarios`, in one file: what `examples/basic/src/routes/usuarios.fud` writes
 * today in its `@server`, without a single `handle`, and the types it sends and receives.
 */

import type { Delete, Get, Load, Put, i32, u8 } from "@fudic/contract";
import type { audit } from "../middlewares/audit";
import type { auth } from "../middlewares/auth";

export default interface Usuarios {
  /** Per request: the list changes with every new person. */
  load: Load<() => UsuariosData, { strategy: "ssr" }>;
  /** Public: no `auth`. */
  search: Get<(q: string) => Person[]>;
  /** The same search, three seconds late: time to cancel it. */
  slowSearch: Get<(q: string) => Person[]>;
  save: Put<(id: i32, active: boolean) => void, [typeof auth]>;
  remove: Delete<(id: i32) => void, [typeof auth, typeof audit]>;
  /** A failure nobody catches: `errorPages` takes the page to `_error.fud` with a 500. */
  crash: Get<() => string>;
}

export interface UsuariosData {
  readonly users: readonly Person[];
}

export interface Person {
  readonly id: i32;
  readonly name: string;
  readonly email: string;
  readonly age: u8;
  readonly active: boolean;
  readonly notes: string;
}
