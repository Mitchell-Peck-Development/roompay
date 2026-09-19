import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import type { RpBackend, RpFunction, RpResult } from "./types"

// Argument names and SQL types per function, in declaration order.
const SIGNATURES: Record<RpFunction, [name: string, type: string][]> = {
  publish: [
    ["p_token_hash", "text"],
    ["p_write_key_hash", "text"],
    ["p_household_label", "text"],
    ["p_roommate_label", "text"],
    ["p_period", "text"],
    ["p_kind", "text"],
    ["p_payload", "jsonb"],
    ["p_last_due_on", "date"],
  ],
  unpublish: [
    ["p_token_hash", "text"],
    ["p_write_key_hash", "text"],
    ["p_period", "text"],
    ["p_kind", "text"],
  ],
  revoke: [
    ["p_token_hash", "text"],
    ["p_write_key_hash", "text"],
  ],
  view: [["p_token_hash", "text"]],
  pick: [
    ["p_token_hash", "text"],
    ["p_period", "text"],
    ["p_kind", "text"],
    ["p_plan", "text"],
  ],
}

// The roles Supabase provides, so the migration's grants apply unchanged.
const SUPABASE_ROLES = `
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;`

export type PgliteBackend = RpBackend & {
  db: PGlite
  migrate(): Promise<void>
  close(): Promise<void>
}

export function defaultMigrationsDir(): string {
  return (
    process.env.RP_MIGRATIONS_DIR ??
    path.resolve(process.cwd(), "../../supabase/migrations")
  )
}

/**
 * An in-process Postgres loaded with the repo's real migrations. `dataDir` is
 * a folder to persist to, or "memory://" for a throwaway database.
 */
export async function createPgliteBackend(
  options: { dataDir?: string; migrationsDir?: string } = {}
): Promise<PgliteBackend> {
  const db = new PGlite(options.dataDir ?? "memory://")
  const migrationsDir = options.migrationsDir ?? defaultMigrationsDir()

  async function migrate() {
    await db.exec(SUPABASE_ROLES)
    // Dev/test only: keep the build from tracing the whole repo through these reads.
    const files = (await readdir(/*turbopackIgnore: true*/ migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort()
    for (const file of files) {
      await db.exec(await readFile(path.join(/*turbopackIgnore: true*/ migrationsDir, file), "utf8"))
    }
  }

  await migrate()

  return {
    db,
    migrate,
    close: () => db.close(),
    async call<T>(fn: RpFunction, args: Record<string, unknown>) {
      const signature = SIGNATURES[fn]
      const placeholders = signature.map(
        ([name, type], i) => `${name} => $${i + 1}::${type}`
      )
      const values = signature.map(([name, type]) => {
        const value = args[name] ?? null
        return type === "jsonb" && value !== null ? JSON.stringify(value) : value
      })
      const { rows } = await db.query<{ result: RpResult<T> }>(
        `select rp.${fn}(${placeholders.join(", ")}) as result`,
        values
      )
      return rows[0]!.result
    },
  }
}
