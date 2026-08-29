# UI Proof for Issue #6

## Claim

The signed-in Participant user page is visibly discoverable from the global header at the supported minimum and application-shell widths.
The Profile control remains usable beside the Operator link, and a maximum-length display name cannot overlap or widen the header.

## Matched conditions

- Baseline revision: `65194c5b1292b2a42260244bc669a11beda0f552`.
- Changed state: the working tree after implementing the issue 6 header change.
- Browser: the same Chromium-backed in-app browser session.
- Viewports: 320 by 800 pixels and 430 by 900 pixels on `/`, plus 430 by 900 pixels on `/profile`.
- Routes: `/` and `/profile` after profile completion.
- Identity: fixed mock uNivUS Platform Operator.
- Display name: `Alexandria Campus ParticipantX`, which is 30 characters.
- NUS Zone: Medicine/Kent Ridge MRT.
- Data: in-memory database with the same fictional Source Feed fixtures.

## Interaction sequence

1. Launch the fixed mock identity through the local uNivUS integration.
2. Complete the profile with the fixed display name and NUS Zone.
3. Return to `/`.
4. Inspect the global header at both fixed viewports.
5. Open `/profile` and inspect the same header at 430 by 900 pixels.

## Assertions

Before the change, no link with the exact accessible name `Profile` existed.
After the change, the exact Profile link is visible at both widths.
At 320 pixels, the supporting display name is removed while the Profile label and Operator link remain fully visible.
At 430 pixels, the display name is ellipsized within the Profile control and the control remains inside the header.
The Playwright journey also proves that activating the link reaches `/profile` without clearing an in-page sentinel.

## Evidence

- Before at 320 pixels: [before-320.png](/Users/qang/projects/lifehack26/feature-app/artifacts/6-no-user-page/ui-proof/before-320.png)
- After at 320 pixels: [after-320.png](/Users/qang/projects/lifehack26/feature-app/artifacts/6-no-user-page/ui-proof/after-320.png)
- Before at 430 pixels: [before-430.png](/Users/qang/projects/lifehack26/feature-app/artifacts/6-no-user-page/ui-proof/before-430.png)
- After at 430 pixels: [after-430.png](/Users/qang/projects/lifehack26/feature-app/artifacts/6-no-user-page/ui-proof/after-430.png)
- Before `/profile` at 430 pixels: [before-profile-430.png](/Users/qang/projects/lifehack26/feature-app/artifacts/6-no-user-page/ui-proof/before-profile-430.png)
- After `/profile` at 430 pixels: [after-profile-430.png](/Users/qang/projects/lifehack26/feature-app/artifacts/6-no-user-page/ui-proof/after-profile-430.png)

The PNG evidence is intentionally untracked and remains in the local issue artifact directory.
