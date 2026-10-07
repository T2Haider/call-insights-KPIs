import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

/**
 * The only file that knows which database engine is in use. Switching to
 * Postgres means changing the imports/driver here, `schema.ts`, and
 * `drizzle.config.ts`, then regenerating migrations.
 */
export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "db", "migrations");

const SETUP_ATTEMPTS = 10;
const BUSY_TIMEOUT_MS = 5000;

function isBusyError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = error instanceof Error ? error.message : "";
  return (
    code.startsWith("SQLITE_BUSY") ||
    code.startsWith("SQLITE_LOCKED") ||
    /locked|busy/i.test(message)
  );
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Opens a database (":memory:" allowed) and applies pending migrations.
 *
 * The web server and the worker are separate processes that can both open a
 * brand-new database at the same instant. SQLite then answers "database is
 * locked" to whichever loses (switching to WAL and the first migration both
 * need the write lock), so setup is retried briefly. The busy timeout is set
 * FIRST so ordinary contention just waits.
 */
export function createDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  const db = drizzle(sqlite, { schema });

  for (let attempt = 1; ; attempt++) {
    try {
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      return db;
    } catch (error) {
      if (!isBusyError(error) || attempt >= SETUP_ATTEMPTS) throw error;
      sleepSync(50 * attempt + Math.floor(Math.random() * 50));
    }
  }
}

// Survives Next.js dev hot-reloads so we do not leak connections.
const globalForDb = globalThis as unknown as { __callsDb?: Db };

/** Shared connection for the current process. */
export function getDb(): Db {
  globalForDb.__callsDb ??= createDb(getConfig().DATABASE_URL);
  return globalForDb.__callsDb;
}
