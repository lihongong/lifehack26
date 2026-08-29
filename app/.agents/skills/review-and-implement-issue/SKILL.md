---
name: review-and-implement-issue
description: Adversarially review and implement a prepared issue plan using a fresh-context agent that reads issue.md, context.md, and plan.md. Use when the user asks to critique and implement a planned issue. Do not use before plan.md exists or when the user requested review without implementation.
---

# Review and Implement Issue

Stress-test the plan from a clean perspective, revise it from evidence, and implement the issue through its verified commit points.

## Establish authority and state

Resolve the artifact directory and require complete `issue.md`, `context.md`, and `plan.md` files.
Read repository instructions and inspect the current branch and working tree before delegating.
The implementation request authorizes in-scope source and test changes, but it does not authorize pushing, modifying the GitHub issue, discarding existing work, or creating commits unless the user also requests those actions.

Compare the current branch, base commit, and worktree state with the snapshot in `context.md`.
Revalidate affected plan claims after any drift and stop when drift makes ownership, requirements, or the implementation seam ambiguous.
Compare planned paths with existing changes, work around non-overlapping changes, and stop before editing an overlapping file whose ownership or intent is unclear.
Record the starting worktree state for the final report.

Require the `Open blockers` section of `plan.md` to be empty or explicitly resolved before implementation begins.
Stop for user direction when any blocker remains.

## Run the adversarial pass

Spawn one subagent with `fork_turns="none"` so it receives no conversational conclusions.
Give it only the repository location, artifact directory, and this task:

1. Read repository instructions plus `issue.md`, `context.md`, and `plan.md` completely.
2. Inspect the current code and tests rather than trusting the plan's claims.
3. Attack the plan for missing acceptance criteria, incorrect seams, hidden coupling, unsafe migrations, security or privacy failures, weak tests, UI regressions, and commit points that cannot stay green.
4. Return findings ranked as blockers, important improvements, and optional refinements, with evidence and concrete plan revisions.
5. Make no file changes during this adversarial pass.

The review is complete when every acceptance criterion and commit point has been challenged against the actual repository.

## Reconcile the plan

Evaluate each finding rather than accepting it automatically.
Write `review.md` in the artifact directory with the finding, evidence, disposition, and reason.
Update `plan.md` for every accepted correction and preserve rejected findings with their rationale in `review.md`.
Stop for user direction when a blocker requires a product decision or authority beyond the issue.
Recheck that `Open blockers` is empty after reconciliation.

For a UI change, invoke `$ui-proof` and capture the reconciled plan's reproducible baseline before any source edit.
For any bug fix, reproduce the reconciled plan's failure in the end-to-end setting and confirm that it fails before any source edit.
Replace earlier evidence when an accepted finding changed the route, scenario, assertion, or verification seam.

## Implement the revised plan

Send a follow-up task to the same adversarial agent instructing it to reread the revised `plan.md` and implement the commit points in order.
State commit and push authorization explicitly in that follow-up task.
When commits were not authorized, say `Treat commit points as verification checkpoints; do not commit or push.`
Require the agent to preserve unrelated work, run the planned checks after each checkpoint, and report changed files and verification results.

Inspect the shared worktree after the agent finishes.
Resolve incomplete acceptance criteria, test failures, lint failures, and visible UI defects before declaring completion.
Within the current authorization, apply repository quality instructions to small safe repairs discovered during the work.
Treat a material unrelated repair as a separate scope and request authority before making it.
For UI work, capture the matched after state and report the `$ui-proof` evidence.
Update `plan.md` to mark completed checkpoints and record any evidence-backed deviation from the plan.

Implementation is complete when every issue acceptance criterion is satisfied, all applicable checks pass, the adversarial findings are resolved or documented, and the final response links the artifact directory and reports commit, push, and GitHub status accurately.
