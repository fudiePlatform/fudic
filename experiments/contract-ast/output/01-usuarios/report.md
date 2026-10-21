# 01-usuarios

Files reached: `components/user-form.server.ts`, `middlewares/audit.ts`, `middlewares/auth.ts`, `routes/usuarios.server.ts`

## component `UserForm` — `components/user-form.server.ts` (from `components/user-form.fud`)

- `PUT save(person: form personForm): Saved` — use auth · {"invalidates":["/usuarios"]}

## route `Usuarios` — `routes/usuarios.server.ts` (from `routes/usuarios.fud`)

- `LOAD load(): UsuariosData` — {"strategy":"ssr"}
- `GET search(q: string): Person[]`
- `GET slowSearch(q: string): Person[]`
- `PUT save(id: i32, active: boolean): void` — use auth
- `DELETE remove(id: i32): void` — use auth, audit
- `GET crash(): string`

## Types

- `Saved` (`components/user-form.server.ts#Saved`): `{ id: i32; name: string }`
- `UsuariosData` (`routes/usuarios.server.ts#UsuariosData`): `{ users: Person[] }`
- `Person` (`routes/usuarios.server.ts#Person`): `{ id: i32; name: string; email: string; age: u8; active: boolean; notes: string }`

## Middlewares

- `auth` (`middlewares/auth.ts#auth`): adds `{ user: { id: i32; name: string } }`, client half: yes
- `audit` (`middlewares/audit.ts#audit`): adds `nothing`, client half: no

## Form `personForm` (`components/user-form.server.ts#personForm`)

- **name**: `str` → `string`, initial `""`, required
- **email**: `str` → `string`, initial `""`, required, pattern({"regex":"^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$","flags":""}), serverValidator("<server code>")
- **age**: `u8` → `u8 | null`, initial `null`, required, min(18), max(120)
- **active**: `bool` → `boolean`, initial `true`
- **notes**: `str` → `string`, initial `""`

catches: [400,409,422]

## Issues

- **note** `regex-dialect` components/user-form.server.ts:27:7 — pattern() also runs on the server: the regex has to mean the same in the backend's dialect
- **error** `server-code-in-form` components/user-form.server.ts:29:7 — serverValidator() holds server code inside the form: with another backend it has to be a named hole the backend implements
