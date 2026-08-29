import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requirePolicyAcceptance } from "../middleware/requirePolicyAcceptance.js";
import { PROTECTED_ACTIONS } from "../services/policyService.js";

export function protectedActionRoutes({ database }) {
  const router = Router();

  for (const action of PROTECTED_ACTIONS) {
    router.post(
      `/${action}`,
      requireParticipant,
      requirePolicyAcceptance({ database, action }),
      (_request, response) => response.json({ action, message: `${action} demonstration action completed.` }),
    );
  }

  return router;
}
