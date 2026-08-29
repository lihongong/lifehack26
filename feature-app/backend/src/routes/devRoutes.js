import { Router } from "express";

export function devRoutes({ database, clock, environment }) {
  const router = Router();
  if (environment === "production") return router;
  router.post("/clock", (request, response) => { clock.set(request.body.now); response.json({ now: clock.now().toISOString() }); });
  router.post("/reset", (_request, response) => {
    database.exec("DROP TRIGGER gem_ledger_no_update; DROP TRIGGER gem_ledger_no_delete; DELETE FROM sessions; DELETE FROM launch_assertions; DELETE FROM gem_ledger; DELETE FROM participants; CREATE TRIGGER gem_ledger_no_update BEFORE UPDATE ON gem_ledger BEGIN SELECT RAISE(ABORT, 'gem_ledger is immutable'); END; CREATE TRIGGER gem_ledger_no_delete BEFORE DELETE ON gem_ledger BEGIN SELECT RAISE(ABORT, 'gem_ledger is immutable'); END;");
    clock.set(null);
    response.status(204).end();
  });
  return router;
}
