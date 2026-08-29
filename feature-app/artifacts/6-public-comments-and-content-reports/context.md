# Implementation Context for Issue #6

## Participant outcome

Authenticated Participants can hold accessible public Comment discussions on Marketplace Listings, with at most one reply level.
Comment authors can edit their own Comments and delete them without destroying the visible thread structure when replies remain.
Participants receive a confirmation warning before submitting Comment text that appears to contain an email address or phone number.
Participants can submit a Content Report for a Marketplace Listing or Comment using one of the specified reasons, without any Gem award.
Moderators can review reports and hide reported Marketplace Listings or Comments with an immutable reason.
Participants receive in-app, non-push notifications for replies and relevant moderation outcomes.

## Acceptance criteria

- A signed-in Participant with current policy acceptance can add a top-level Comment or a reply to a Marketplace Listing.
- The service rejects deeper nesting, anonymous writes, and writes from Participants missing current Comment policy acceptance.
- A Comment author can edit their Comment, and public rendering marks it as edited.
- A Comment author can delete their Comment, removing it entirely when it has no replies and retaining a removed-parent placeholder when replies remain.
- Obvious email addresses and phone numbers cause a pre-submission warning that requires explicit confirmation.
- A Participant can report a Marketplace Listing or Comment for fraud, safety, privacy, or staleness.
- A Content Report does not create a Gem Ledger entry or change the reporter's Gem balance.
- A Moderator can review open Content Reports and hide the reported content with an immutable reason and audit event.
- The full Participant-to-Moderator report journey is covered through the visible application in Playwright.
- Reply and moderation events create non-push notifications visible to the relevant Participant.

## Repository state

- Current branch: `feat/issue-6-public-comments-content-reports`.
- Base commit: `cb01d8692cca951e00983b0b54e2e79cf6b338a9`, matching refreshed `origin/main` at preparation time.
- The tracked working tree was clean before artifact creation.
- An unrelated untracked `../app/` path exists outside this workspace directory and must remain untouched.

## Applicable instructions and decisions

- `AGENTS.md` requires issue work to start from the latest remote `main`, use an issue-specific branch, and eventually be pushed through a pull request containing `Closes #6`.
- `AGENTS.md` requires bug fixes to begin with an end-to-end reproduction and asks for exacting UI, lint, test, and flake quality.
- `CONTEXT.md` defines Participant, Comment, Content Report, Moderator, Marketplace Listing, Gem, and other product terms.
- `docs/adr/0006-allow-moderated-public-comments-on-every-post.md` requires Comments on every post type, public display names, one reply level, author editing and deletion with removed-parent placeholders, reportability, Moderator hiding, and exclusion of private claim details.
- Issue #6 currently scopes its explicit acceptance criterion for creation and replies to Marketplace Listings, while ADR 0006 establishes the reusable cross-post model for future post types.
- `docs/adr/0003-use-broad-moderator-authority-with-immutable-auditing.md` requires broad Moderator powers and an immutable audit record for every sensitive action.
- `docs/adr/0008-make-sanitized-feeds-publicly-readable.md` keeps sanitized feeds public while requiring authentication for commenting.
- `docs/adr/0004-build-an-installable-nextjs-app-on-vercel-and-supabase.md` is the production target, but the current tracer implementation is React/Vite, Express, and SQLite.

## Existing architecture and behavior

- `backend/src/app.js` is the side-effect-free Express application factory and composes public listing, authentication, policy, privileged, moderation, and development routes.
- `backend/src/db/database.js` runs every sorted idempotent SQL migration on startup and supports `:memory:` databases for tests.
- `backend/src/migrations/001_participants.sql` stores Participants, sessions, and the immutable Gem Ledger.
- `backend/src/migrations/002_policies.sql` defines `comments` as a protected action and stores immutable policy acceptance history.
- `backend/src/migrations/003_privileged_roles.sql` stores Moderator roles, Marketplace Listing hide state, and immutable audit events.
- `backend/src/middleware/requireParticipant.js` resolves private sessions and exposes the authenticated Participant to routes.
- `backend/src/middleware/requirePolicyAcceptance.js` returns `428 POLICY_ACCEPTANCE_REQUIRED` when an authenticated Participant has not accepted the active policies for a protected action.
- `backend/src/services/listingsService.js` exposes sanitized seeded Marketplace Listings and filters listing IDs hidden through moderation.
- `backend/src/services/moderationService.js` provides the current Marketplace Listing hide and restore transaction, validates a required reason, and records an audit event in the same transaction.
- `backend/src/services/privilegeService.js` owns reason validation and immutable audit insertion.
- There is no current Comment, Content Report, or notification persistence, service, route, API, or UI.
- `frontend/src/pages/ExchangePage.jsx` renders the public Marketplace Listing feed.
- `frontend/src/components/ListingCard.jsx` is the visible Marketplace Listing boundary and currently exposes only listing content and external contact actions.
- `frontend/src/pages/ModerationPage.jsx` is the Moderator-only Marketplace moderation surface and currently lists all Marketplace Listings with direct hide and restore controls.
- `frontend/src/pages/ProfilePage.jsx` is the authenticated private surface and is a natural existing location for non-push notification history.
- `frontend/src/auth/AuthContext.jsx` exposes the current private Participant to React components.

## Relevant tests and public seams

- `test/policyApi.test.js` verifies authentication and policy gating at HTTP endpoints.
- `test/privileges.test.js` verifies Moderator enrollment, Marketplace Listing moderation, immutable audit behavior, and session revocation through HTTP endpoints.
- `e2e/marketplace.spec.js` verifies public Marketplace behavior at the rendered UI.
- `e2e/policies.spec.js` contains reusable Participant launch, onboarding, and policy-acceptance interactions.
- `e2e/privileges.spec.js` contains reusable Platform Operator and Moderator launch and enrollment interactions plus visible moderation assertions.
- Playwright runs mobile iPhone 13 and desktop Chromium projects against a built frontend and an in-memory backend.

## Validation commands

- Focused backend tests: `node --test test/<file>.test.js`.
- All backend tests: `npm test`.
- Frontend type-equivalent compilation and bundle validation: `npm run build`.
- Focused Playwright test: `npm run test --prefix e2e -- <spec> --project=<project>`.
- Full end-to-end suite: `npm run test:e2e`.
- The repository has no configured TypeScript typecheck or lint script.

## Dependencies, constraints, and factual gaps

- Declared blockers #4 and #5 are closed as completed.
- Seeded Marketplace Listings are not database rows, so polymorphic content references cannot rely on one foreign key to a posts table.
- Comment authorship must expose only the Participant's public ID and display name, never private email or external subject.
- Comment creation should use the existing `comments` policy gate, while reporting is authenticated but is not identified by issue #6 or policy tables as a separately policy-gated action.
- The issue does not specify notification read-state behavior, so an in-app chronological notification list is sufficient unless implementation evidence exposes a stronger existing convention.
- The issue does not specify whether reporters receive moderation outcomes for reports submitted by other Participants; the minimum safe interpretation is to notify the reporter whose Content Report is resolved and Comment authors whose content is hidden.
- The issue does not specify whether author deletion is reversible; the ADR requires removed-parent placeholders, while no restoration behavior is requested.
- Parent and formal blocking metadata were unavailable from the selected GitHub connector beyond the issue body's declared blockers.
