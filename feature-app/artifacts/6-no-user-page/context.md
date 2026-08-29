# Implementation Context for Issue #6

## Participant outcome

A Participant can recognize and open their user page from the application header.
The private page shows the Participant's public identity, private account details, Gem balance and ledger, notifications, policy history, and profile settings.
The Participant can open the matching public profile and verify that private account data is absent.

## Acceptance criteria inferred from the issue and current product

- A signed-in Participant has a visible, understandable user-page entry in the global header.
- The entry opens the existing private profile route without a full-document navigation.
- A Participant who has not completed setup can still recognize the entry as the place to complete their profile.
- The private profile continues to expose private account data only to its authenticated Participant.
- The public profile continues to expose only public identity data and remains reachable without authentication.
- The header remains usable at the application's 430-pixel shell width and with privileged links present.

The issue body does not define new profile fields, activity history, social features, or backend persistence.
Those are outside the evidence-supported scope.

## Repository state

- Current branch: `codex/issue-6-user-page`.
- Base commit: `65194c5b1292b2a42260244bc669a11beda0f552`, matching refreshed `origin/main` at preparation time.
- The working tree was clean before this issue workspace was created.
- The issue-specific branch was created from the latest remote `main`.

## Applicable instructions and decisions

- `AGENTS.md` requires issue work on a new issue-specific branch from the latest remote `main`, followed by a pushed pull request containing `Closes #6`.
- `AGENTS.md` requires end-to-end reproduction before a bug fix and exacting visible UI quality.
- `CONTEXT.md` defines a Participant as a person using the application and states that private profiles, Gem activity, and selected NUS Zones are not public.
- `docs/adr/0008-make-sanitized-feeds-publicly-readable.md` requires public profile output to exclude private profiles, Gem balances, selected NUS Zones, and activity histories.
- The repository uses plain JavaScript, React, Vite, Express, SQLite, Node's test runner, and Playwright.

## Existing behavior

- `frontend/src/App.jsx` already maps `/profile`, `/profile/setup`, and `/participants/:publicId` to private setup, private profile, and public profile pages.
- `frontend/src/pages/ProfilePage.jsx` already renders identity, private email and NUS Zone, Gem state, editable profile fields, notifications, policy history, and a public-profile link.
- `frontend/src/pages/PublicProfilePage.jsx` already renders only the public display name and verification state.
- `backend/src/routes/profileRoutes.js` already provides authenticated private profile updates and anonymous public profile reads.
- `backend/src/services/participantService.js` already limits public profile output to `publicId`, `displayName`, `verificationState`, and a non-sensitive avatar identifier.
- `frontend/src/components/CommentThread.jsx` already links Comment author display names to public profile pages.
- `frontend/src/components/AppHeader.jsx` is the global account entry point, but it renders only an icon in a circular control.
- The icon has an accessible name, but no visible text tells sighted Participants that a user page exists or identifies the current Participant.
- The signed-in account control uses a plain anchor for an internal route rather than the application's React router.

## Existing verification and observed baseline

- `e2e/participant.spec.js` completes a profile, verifies Gem behavior across devices, opens the private profile, and verifies the public privacy boundary.
- `test/participantAuth.test.js` verifies public profile field minimization and private-field exclusion.
- The existing desktop Participant journey passes on the current base revision.
- The current journey does not assert that the global header visibly exposes a user-page destination.
- A new exact-role assertion for a visible `Profile` link is expected to fail because the current accessible name is `Open private profile` and the control has no visible label.

## Validation commands

- Focused backend profile tests: `node --test test/participantAuth.test.js`.
- Focused desktop browser test: `npm run test --prefix e2e -- participant.spec.js --project=desktop`.
- Focused mobile browser test: `npm run test --prefix e2e -- participant.spec.js --project=mobile`.
- All backend tests: `npm test`.
- Frontend compilation and bundle validation: `npm run build`.
- Full browser suite: `npm run test:e2e`.
- The repository has no configured TypeScript typecheck or lint script.

## Constraints and unresolved factual gaps

- Issue #6 was opened before commit `88d860b`, which introduced the current profile experience, so the route implementation already exists on the present base.
- The remaining observable gap is discoverability rather than absent persistence or routing.
- The issue contains no mockup or copy requirements, so visible labels should use the established Participant and Profile vocabulary without adding new product concepts.
- The narrow 430-pixel application shell and optional Operator or Moderator links constrain the account control width.
- Local browser tests require permission to bind the test server to a loopback port in this environment.
