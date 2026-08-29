import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/**
 * A real Postgres (PGlite is Postgres compiled to WASM) with the real migration
 * applied. Tests here exercise the actual RLS policies, not a description of them.
 *
 * Two things have to be faithful or the tests prove nothing:
 *  - queries run as `authenticated`, not as the table owner. Postgres skips RLS
 *    for the owner, so testing as `postgres` would pass every policy trivially.
 *  - auth.uid() reads the same setting Supabase's does.
 */
const AUTH_SHIM = `
create schema auth;
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique not null
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
`;

const GRANTS = `
create role authenticated nologin;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage on schema auth to authenticated;
`;

export interface TestDb {
  /** run SQL as a signed-in user; RLS applies */
  as<T = any>(userId: string, sql: string, params?: any[]): Promise<T[]>;
  /** run SQL with owner rights, bypassing RLS — for arranging fixtures */
  admin<T = any>(sql: string, params?: any[]): Promise<T[]>;
  /** create an auth user (the trigger makes their profile) and return the id */
  signUp(email: string, name: string): Promise<string>;
  close(): Promise<void>;
}

export async function testDb(): Promise<TestDb> {
  const db = await PGlite.create();
  await db.exec(AUTH_SHIM);
  await db.exec(readFileSync("supabase/migrations/0001_init.sql", "utf8"));
  await db.exec(GRANTS);

  const admin = async <T>(sql: string, params: any[] = []) =>
    (await db.query<T>(sql, params)).rows;

  const as = async <T>(userId: string, sql: string, params: any[] = []) => {
    await db.exec("begin");
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await db.exec("set local role authenticated");
      const rows = (await db.query<T>(sql, params)).rows;
      await db.exec("commit");
      return rows;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  };

  return {
    as,
    admin,
    async signUp(email, name) {
      const [u] = await admin<{ id: string }>(
        "insert into auth.users (email) values ($1) returning id",
        [email],
      );
      await admin("update profiles set display_name = $2 where id = $1", [u.id, name]);
      return u.id;
    },
    close: () => db.close(),
  };
}

/** assert that a statement is refused, and say what we expected when it isn't */
export async function denied(fn: () => Promise<unknown>, what: string) {
  try {
    await fn();
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error(`expected to be denied: ${what}`);
}
