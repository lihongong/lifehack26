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
  const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  const existingApplicationSchema = Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'participants'").get());
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  if (existingApplicationSchema && !database.prepare("SELECT 1 FROM schema_migrations LIMIT 1").get()) {
    const markApplied = database.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");
    const appliedAt = new Date().toISOString();
    for (const migration of migrations.filter((name) => name < "006_buffet_alerts.sql")) markApplied.run(migration, appliedAt);
  }
  const isApplied = database.prepare("SELECT 1 FROM schema_migrations WHERE name = ?");
  const markApplied = database.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");
  for (const migration of migrations) {
    if (isApplied.get(migration)) continue;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(readFileSync(join(migrationsDir, migration), "utf8"));
      markApplied.run(migration, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
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
