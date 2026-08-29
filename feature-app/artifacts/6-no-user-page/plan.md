# Implementation Plan for Issue #6

## Outcome

Every application page visibly exposes the signed-in Participant's user page through a compact Profile control in the global header.
The control identifies the current Participant when space permits, remains understandable during initial profile setup, and uses client-side navigation for the internal private-profile route.
The existing private and public profile behavior and privacy boundaries remain unchanged.

## Acceptance mapping

### Discoverable user page

Change the signed-in global account control from an icon-only anchor into a visibly labelled React Router link.
Display `Profile` as the stable destination label and the Participant's display name, or `Complete profile` before setup, as supporting context.
Give the control the exact accessible name `Profile` while retaining visible supporting text.
Verify through Playwright that a Participant can find the exact Profile link on `/`, use it to reach `/profile`, and preserve an in-page sentinel that proves client-side routing occurred.

### Setup-safe navigation

Keep the account destination at `/profile` because the private page already redirects incomplete Participants to `/profile/setup`.
Before completing setup, verify that the exact Profile link and visible `Complete profile` supporting text are present.
Activate the link and verify that the existing redirect safely returns the incomplete Participant to `/profile/setup`.

### Responsive and privileged header

Style the labelled control as a compact pill that fits the 430-pixel application shell, truncates long display names, and preserves Operator or Moderator navigation.
Verify a maximum-length display name with the Operator link present at the supported 320-pixel minimum and the 430-pixel application-shell width.
Assert that the brand, Operator link, and Profile control stay within the header without overlap, and inspect visible focus treatment.

### Existing profile and privacy behavior

Preserve the private profile contents, public profile route, anonymous public access, and public response field minimization.
Verify with the focused Participant browser journey and `test/participantAuth.test.js`.

## Feature changes

1. Add a failing browser assertion at the rendered global-header seam.
Before profile setup, require an exact accessible link name of `Profile` plus visible `Complete profile` supporting text, and prove activation safely returns to `/profile/setup`.
After setup, return to `/`, install an in-page sentinel, activate the exact Profile link, and prove both the `/profile` destination and sentinel survival.
Confirm the focused desktop test fails against the base implementation before editing source code.

2. Make the user page discoverable in `AppHeader`.
Render authenticated internal navigation with React Router's `Link`.
Pair the existing account icon with a stable visible `Profile` label and a bounded secondary label for the display name or incomplete-profile state.
Set the link's accessible name explicitly to `Profile` so the supporting identity text does not create an unstable control name.
Keep the unauthenticated uNivUS handoff as a normal anchor because it is an application entry flow rather than an internal route.

3. Add responsive header styling.
Replace the authenticated circular icon treatment with a compact pill while retaining the orange account affordance, keyboard focus visibility, and adequate touch target.
Constrain and truncate the identity label so privileged tools and the brand remain usable within the fixed mobile shell.

4. Complete the browser slice.
Run the focused test to green on desktop and mobile.
Exercise a 30-character display name and Operator navigation at 320- and 430-pixel widths.
Inspect matched screenshots at `/` after profile completion and at `/profile` after navigation for clipping, overlap, or unrelated regressions.

## Commit points

### Commit 1 - Expose the Participant user page in global navigation

Scope: add the failing Playwright assertion, update the authenticated header control, and add responsive styles.
Prerequisites: the prepared issue workspace and confirmed rendered-header test seam.
Tests: focused Participant browser test on desktop and mobile, focused participant backend tests, and frontend build.
Proof: the header visibly contains a Profile link, activation reaches `/profile`, the display name is bounded within the control, and the public profile still excludes private fields.

This single vertical commit is independently coherent and leaves the repository green.

## Verification

### Unit and integration

Run `node --test test/participantAuth.test.js` to retain the public-profile privacy contract.
No new backend unit test is needed because the behavior change is entirely at the rendered navigation seam.

### End to end

Before source edits, run the focused desktop Participant journey with the new Profile-link assertion and record the expected failure.
After the change, run the same test on desktop and mobile.
Run the full Playwright suite once at the end.

### Build and static validation

Run `npm run build` regularly as the repository's frontend compile check.
Run `npm test` once at the end for the complete backend suite.
The repository exposes no lint or TypeScript typecheck command.

### Accessibility

Locate the control by role and exact accessible name rather than CSS selectors.
Retain the decorative icon's `aria-hidden` state, visible focus ring, keyboard activation, and minimum touch-target height.
Ensure truncated supporting text does not replace the stable Profile label.

### UI proof

Baseline revision: `65194c5b1292b2a42260244bc669a11beda0f552`.
Changed revision: the final issue branch head.
Route: `/` after completing a synthetic maximum-length Participant profile, followed by `/profile` through the header control.
Viewports: explicit 320-by-800 and 430-by-900 captures on `/`, plus a 430-by-900 capture on `/profile`, in the same Chromium browser.
Seed state: in-memory database reset, fixed test clock, mock uNivUS Platform Operator identity, a 30-character display name, and fictional repository fixtures.
Interaction: launch from uNivUS, verify the incomplete-profile control, complete the public name and NUS Zone, return to the exchange, install the in-page sentinel, locate the exact Profile control, and activate it.
Baseline assertion: no visible link with the stable name `Profile` is present in the header.
Changed assertion: the exact Profile link is visible, its supporting identity is visibly truncated without overlap, activation reaches `/profile` with the Participant heading present, and the in-page sentinel survives.
Store external UI-proof captures as untracked `artifacts/6-no-user-page/ui-proof/before-320.png`, `before-430.png`, `after-320.png`, and `after-430.png`.
Recreate the baseline from the pinned base revision in a separate safe worktree on a distinct port, and use the same database seed, clock, browser, viewport, and interaction sequence for both revisions.

## Risks and recovery

- A wider account control could crowd Operator or Moderator links on narrow screens.
Mitigate with a bounded secondary label, truncation, compact spacing, and both mobile and privileged-state inspection.
- Changing from an anchor to a router link could alter navigation semantics.
Limit the change to the authenticated internal `/profile` route and retain a normal anchor for `/univus/`.
- A display name may be long or absent.
Use a stable Profile label, a constrained optional identity line, and the explicit `Complete profile` fallback.
- If the labelled pill cannot fit alongside privileged navigation without compromising tap targets, recover by hiding only the secondary identity line at the narrow breakpoint while retaining the visible Profile label.
- The change is presentation-only and can be rolled back by restoring the current icon-only account control and its circular style.

## Open blockers

None.
The current code and issue history support a discoverability-focused implementation without new profile fields or backend behavior.
