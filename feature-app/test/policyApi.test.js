import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../backend/src/app.js";
import { createDatabase } from "../backend/src/db/database.js";
import { completeLaunch, createLaunchAssertion } from "../backend/src/services/authService.js";
import { createClock } from "../backend/src/services/clock.js";
import { activatePolicyVersion } from "../backend/src/services/policyService.js";

const now = new Date("2026-08-29T10:00:00Z");

async function withApp(run) {
  const database = createDatabase(":memory:");
  const clock = createClock(now);
  const { session } = completeLaunch(
    database,
    createLaunchAssertion(database, { subject: "api-policy-user", email: "private@example.nus.edu.sg" }, now),
    now,
  );
  const app = createApp({ database, clock, environment: "test", univusAdapter: { resolveIdentity: () => null } });
  try {
    await run({ database, api: request(app), cookie: `univus_session=${session.rawToken}` });
  } finally {
    database.close();
  }
}

test("public browsing stays open while protected actions enforce authentication and policies", async () => {
  await withApp(async ({ api, cookie }) => {
    assert.equal((await api.get("/api/listings")).status, 200);
    assert.equal((await api.post("/api/protected-actions/comments")).status, 401);

    const rejected = await api.post("/api/protected-actions/comments").set("Cookie", cookie);
    assert.equal(rejected.status, 428);
    assert.deepEqual(rejected.body, {
      code: "POLICY_ACCEPTANCE_REQUIRED",
      action: "comments",
      missingPolicies: [
        { type: "terms", version: "2026-08-29" },
        { type: "privacy", version: "2026-08-29" },
      ],
    });

    const activeResponse = await api.get("/api/policies/active").set("Cookie", cookie);
    const activeBody = activeResponse.body;
    assert.equal(JSON.stringify(activeBody).includes("private@example.nus.edu.sg"), false);
    const accepted = await api.post("/api/me/policy-acceptances").set("Cookie", cookie).send({ versionIds: activeBody.policies.map(({ id }) => id) });
    assert.equal(accepted.status, 201);
    assert.equal((await api.post("/api/protected-actions/comments").set("Cookie", cookie)).status, 200);
  });
});

test("a scoped material update rejects affected actions but not unrelated ones", async () => {
  await withApp(async ({ database, api, cookie }) => {
    const active = (await api.get("/api/policies/active").set("Cookie", cookie)).body;
    await api.post("/api/me/policy-acceptances").set("Cookie", cookie).send({ versionIds: active.policies.map(({ id }) => id) });
    activatePolicyVersion(database, "terms", "2026-09-15", new Date("2026-09-15T00:00:00Z"));

    assert.equal((await api.post("/api/protected-actions/comments").set("Cookie", cookie)).status, 428);
    assert.equal((await api.post("/api/protected-actions/claims").set("Cookie", cookie)).status, 200);
    assert.equal((await api.get("/api/listings")).status, 200);
  });
});
