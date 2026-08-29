---
name: ui-proof
description: Capture before-and-after UI evidence for web changes with Playwright-driven browser state, matched routes, viewports, data, screenshots, and assertions. Use when asked to prove, demonstrate, visually verify, or document a UI change or regression. Do not use for changes with no observable UI.
---

# UI Proof

Produce evidence that a requested UI behavior changed while every relevant test condition stayed equivalent.
A screenshot pair is proof only when the baseline, interaction state, and comparison are trustworthy.

## Define the proof contract

Before changing code, state the observable claim and fix these conditions:

- Baseline revision or deployment
- Route and query parameters
- Viewport and browser
- Participant identity, permissions, feature flags, locale, and timezone
- Seed data and time-sensitive state
- Interaction steps that reach the state
- DOM assertion that distinguishes failure from success

Use the smallest state that demonstrates the behavior, plus enough surrounding UI to make the screenshot understandable.

## Capture the baseline

Load `browser:control-in-app-browser` before browser work.
Use its Playwright locators for navigation and interaction, and its screenshot capability for evidence.

Capture the baseline before editing whenever possible.
If the change already exists, recover the requested base revision from an existing deployment or a separate safe worktree.
Keep the user's dirty worktree intact and run baseline and changed revisions on distinct ports.
If no valid baseline can be recovered, provide an after-only diagnostic and explicitly state that it is not before-and-after proof.

Start from deterministic seed data.
Use synthetic content instead of personal or secret data.
Wait for a specific visible state or assertion rather than relying on an arbitrary delay.
Freeze time or suppress motion only when the same treatment is applied to both captures.

The baseline is complete when the failing or old behavior is visible, the distinguishing DOM assertion confirms that state, and `before.png` has been captured.

## Capture the changed state

Run the changed revision under the same proof contract.
Replay the same interaction steps with Playwright locators.
Confirm the expected behavior with a DOM assertion before taking `after.png`.

Keep screenshots at identical dimensions and scroll positions.
Capture the full viewport for context and add a focused component capture only when it materially improves the evidence.
Inspect both images for clipping, overlap, unintended layout shifts, stale loading states, and unrelated visual regressions.

The comparison is complete when the expected assertion passes, the changed behavior is visible, and every material condition matches the baseline.

## Preserve and report evidence

Store evidence in a task-scoped temporary directory or the repository's established artifact directory.
Keep generated screenshots out of tracked source unless the user asks to commit them.
Use stable names such as `before.png` and `after.png`.

Report:

- The exact claim proved
- Baseline and changed revisions or deployments
- Route, viewport, seed state, and interaction sequence
- Before and after assertions
- Absolute links that render both screenshots
- Any mismatch, limitation, or unproven behavior

Never claim proof from an after-only screenshot, mismatched data, different viewports, different interaction states, or a baseline that did not reproduce the old behavior.
