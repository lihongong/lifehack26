import { getPolicyStatus, PROTECTED_ACTIONS } from "../services/policyService.js";

export function requirePolicyAcceptance({ database, action }) {
  return (request, response, next) => {
    const resolvedAction = typeof action === "function" ? action(request) : action;
    if (!PROTECTED_ACTIONS.includes(resolvedAction)) return response.status(404).json({ error: "Unknown protected action" });
    const status = getPolicyStatus(database, request.participant.participant_id, resolvedAction);
    if (!status.allowed) {
      const missingPolicies = status.missingPolicies.map(({ type, version }) => ({ type, version }));
      return response.status(428).json({ code: "POLICY_ACCEPTANCE_REQUIRED", action: resolvedAction, missingPolicies });
    }
    next();
  };
}
