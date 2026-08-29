import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase } from "../backend/src/db/database.js";

test("a falsely baselined Marketplace lifecycle migration repairs itself", () => {
  const directory = mkdtempSync(join(tmpdir(), "lifehack26-migration-"));
  const path = join(directory, "app.sqlite");
  try {
    const broken = createDatabase(path);
    broken.exec("DROP TABLE marketplace_listing_lifecycle");
    broken.close();

    const repaired = createDatabase(path);
    assert.ok(repaired.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'marketplace_listing_lifecycle'").get());
    assert.ok(repaired.prepare("SELECT 1 FROM schema_migrations WHERE name = '005_marketplace_listing_lifecycle.sql'").get());
    repaired.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
