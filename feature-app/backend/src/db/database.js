import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export function createDatabase(
  path = process.env.DATABASE_PATH || join(currentDir, "../../data/community-exchange.sqlite"),
) {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  database.exec(readFileSync(join(currentDir, "../migrations/001_participants.sql"), "utf8"));
  return database;
}
