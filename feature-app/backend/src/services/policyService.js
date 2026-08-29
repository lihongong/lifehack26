import { randomUUID } from "node:crypto";

export const PROTECTED_ACTIONS = Object.freeze(["posting", "comments", "claims", "alerts", "redemptions"]);
const POLICY_TYPES = ["terms", "privacy"];

export function getActivePolicies(database, participantId) {
  return database.prepare(`
    SELECT pv.id, pv.policy_type AS type, pv.version, pv.title, pv.content,
      pv.material_change AS materialChange, pv.effective_at AS effectiveAt,
      CASE WHEN pa.id IS NULL THEN 0 ELSE 1 END AS accepted
    FROM active_policies ap
    JOIN policy_versions pv ON pv.id = ap.policy_version_id
    LEFT JOIN policy_acceptances pa ON pa.policy_version_id = pv.id AND pa.participant_id = ?
    ORDER BY pv.policy_type
  `).all(participantId || "").map((policy) => ({ ...policy, accepted: Boolean(policy.accepted), affectedActions: database.prepare("SELECT action FROM policy_action_requirements WHERE policy_version_id = ? ORDER BY action").all(policy.id).map(({ action }) => action) }));
}

function requiredVersion(database, type, action) {
  return database.prepare(`
    SELECT candidate.id, candidate.policy_type AS type, candidate.version, candidate.effective_at AS effectiveAt
    FROM active_policies ap
    JOIN policy_versions active ON active.id = ap.policy_version_id
    JOIN policy_versions candidate ON candidate.policy_type = ap.policy_type AND candidate.effective_at <= active.effective_at
    JOIN policy_action_requirements requirement ON requirement.policy_version_id = candidate.id AND requirement.action = ?
    WHERE ap.policy_type = ? AND candidate.material_change = 1
    ORDER BY candidate.effective_at DESC LIMIT 1
  `).get(action, type);
}

function hasSatisfyingAcceptance(database, participantId, required) {
  return Boolean(database.prepare(`
    SELECT pa.id FROM policy_acceptances pa
    JOIN policy_versions accepted ON accepted.id = pa.policy_version_id
    JOIN active_policies ap ON ap.policy_type = accepted.policy_type
    JOIN policy_versions active ON active.id = ap.policy_version_id
    WHERE pa.participant_id = ? AND accepted.policy_type = ?
      AND accepted.effective_at >= ? AND accepted.effective_at <= active.effective_at
    LIMIT 1
  `).get(participantId, required.type, required.effectiveAt));
}

export function getPolicyStatus(database, participantId, action) {
  if (!PROTECTED_ACTIONS.includes(action)) throw Object.assign(new Error("Unknown protected action."), { status: 404 });
  const requiredPolicies = POLICY_TYPES.map((type) => requiredVersion(database, type, action)).filter(Boolean);
  const missingPolicies = requiredPolicies.filter((policy) => !hasSatisfyingAcceptance(database, participantId, policy)).map(({ id, type, version }) => ({ id, type, version }));
  return { action, allowed: missingPolicies.length === 0, missingPolicies, activePolicies: getActivePolicies(database, participantId) };
}

export function acceptActivePolicies(database, participantId, versionIds, now) {
  if (!Array.isArray(versionIds) || !versionIds.length || new Set(versionIds).size !== versionIds.length) throw Object.assign(new Error("Provide distinct active policy versions."), { status: 422 });
  const activePolicies = getActivePolicies(database, participantId);
  const activeIds = new Set(activePolicies.map(({ id }) => id));
  if (versionIds.some((id) => !activeIds.has(id))) throw Object.assign(new Error("Only active policy versions can be accepted."), { status: 409 });
  const requiredIds = activePolicies.filter(({ accepted }) => !accepted).map(({ id }) => id);
  if (requiredIds.length !== versionIds.length || requiredIds.some((id) => !versionIds.includes(id))) {
    throw Object.assign(new Error("Confirm every currently unaccepted policy version together."), { status: 422 });
  }
  const existing = database.prepare(`SELECT policy_version_id FROM policy_acceptances WHERE participant_id = ? AND policy_version_id IN (${versionIds.map(() => "?").join(",")})`).all(participantId, ...versionIds);
  if (existing.length) throw Object.assign(new Error("A submitted policy version was already accepted."), { status: 409 });
  database.exec("BEGIN IMMEDIATE");
  try {
    const insert = database.prepare("INSERT INTO policy_acceptances (id, participant_id, policy_version_id, accepted_at, session_source) VALUES (?, ?, ?, ?, 'univus_session')");
    for (const versionId of versionIds) insert.run(randomUUID(), participantId, versionId, now.toISOString());
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return getAcceptanceHistory(database, participantId);
}

export function getAcceptanceHistory(database, participantId) {
  return database.prepare(`SELECT pa.id, pv.policy_type AS type, pv.version, pv.title, pa.accepted_at AS acceptedAt FROM policy_acceptances pa JOIN policy_versions pv ON pv.id = pa.policy_version_id WHERE pa.participant_id = ? ORDER BY pa.accepted_at DESC, pv.policy_type`).all(participantId);
}

export function activatePolicyVersion(database, type, version, now) {
  const candidate = database.prepare("SELECT * FROM policy_versions WHERE policy_type = ? AND version = ?").get(type, version);
  if (!candidate) throw Object.assign(new Error("Policy version not found."), { status: 404 });
  const current = database.prepare("SELECT pv.* FROM active_policies ap JOIN policy_versions pv ON pv.id = ap.policy_version_id WHERE ap.policy_type = ?").get(type);
  if (candidate.effective_at <= current.effective_at) throw Object.assign(new Error("Policy activation must move forward."), { status: 409 });
  database.prepare("UPDATE active_policies SET policy_version_id = ?, activated_at = ? WHERE policy_type = ?").run(candidate.id, now.toISOString(), type);
  return candidate;
}
