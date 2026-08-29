import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export function createDatabase(
  path = process.env.DATABASE_PATH || join(currentDir, "../../data/community-exchange.sqlite"),
) {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  const migrationsDir = join(currentDir, "../migrations");
  for (const migration of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(join(migrationsDir, migration), "utf8"));
  }
  return database;
}

export function withImmediateTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
