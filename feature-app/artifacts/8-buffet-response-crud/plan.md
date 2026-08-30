# Issue 8 implementation plan

## Outcome

A Moderator can publish a time-limited manual Buffet Post from the existing moderation page and soft-delete it later with a required reason.
The manual post is clearly distinguished from Source Feed fixtures, follows the existing public Buffet filters and expiry behavior, and never mutates Source Feed provenance.
Every successful publication and deletion is atomically recorded in the immutable audit log.
Both manual and Source Feed origins accept public Comments and share the existing Buffet Alert and food-gone review lifecycle through a canonical Buffet Post reference.

## Acceptance mapping

| Issue requirement | Change | Verification |
| --- | --- | --- |
| Create a Buffet response post | Add Moderator-only manual Buffet Post persistence, HTTP creation, management UI, and public feed projection. | HTTP integration verifies authorization, validation, public projection, provenance, and audit; Playwright publishes from the Moderator UI and observes the public card. |
| Delete a Buffet response post | Add Moderator-only soft deletion with a required reason and transactional audit event. | HTTP integration verifies authorization, Source Feed isolation, retained deletion metadata, rollback, and immutable audit; Playwright deletes and observes public removal. |
| Preserve existing Source Feed behavior | Keep Source Feed tables and adapters unchanged while registering canonical references for both origins. | Focused feed and alert tests verify fixtures and Helpful Alert behavior; API assertions retain the Source Feed `science-bentos` record. |
| Share post interactions | Resolve both origins through the Buffet visibility seam for Comments, alerts, food-gone signals, and Moderator review. | HTTP integration exercises manual alert delivery, Comment creation, possibly-gone visibility, restoration, and source-origin Comment visibility. |

## Feature changes

1. Reproduce the missing Moderator create/delete workflow at `/moderation/marketplace` and `/buffets` in Playwright before source changes.
2. Add `009_manual_buffet_posts.sql` with separate provenance fields and soft-deletion metadata.
3. Add a manual Buffet service that validates public fields, canonical zones, future deadlines, and reasons, and records data plus audit events transactionally.
4. Add isolated Moderator routes at `/api/moderation/buffets` so ordinary Participants and the Platform Operator fail closed.
5. Combine active manual posts with Source Feed posts in the public projection and lifecycle service while retaining explicit origin.
6. Add a focused Moderator management component to the existing Buffet moderation area without expanding the general moderation page.
7. Label manual public cards as ShareNUS Moderator additions and preserve the fictional Source Feed labels.
8. Reset manual demonstration records in the existing non-production reset transaction.
9. Parse deadline wall-clock input explicitly as UTC+08:00 and verify it from a non-Singapore browser timezone.
10. Make publication, audit, alert delivery, and notifications one transaction, and fence reviews and feedback when deletion makes a post terminal.
11. Use opaque public references for Comments and enforce origin consistency at the database boundary.

## Commit points

### 1. Add audited manual Buffet Post CRUD

Commit title: `Add audited Buffet Post CRUD`

Scope:

- Replace the incorrect Comment interpretation and its tests.
- Add manual Buffet persistence, service, routes, public projection, Moderator UI, tests, and issue artifacts.
- Rebase onto the current ShareNUS `origin/main` before final verification.

Prerequisites:

- The Playwright reproduction must fail because `.manual-buffet-form` is absent from the Moderator page.

Tests and proof:

- Focused manual Buffet HTTP tests.
- Existing Buffet feed and alert tests.
- Focused Playwright CRUD journey on mobile and desktop with port 3208.
- Production frontend build.
- Full backend suite.
- Full Playwright suite on mobile and desktop with port 3208.
- Mobile and desktop inspection of the management form and public manual card.

## Verification

- Authorization: anonymous, Participant, and Platform Operator requests cannot create or delete manual Buffet Posts.
- Validation: title, description, location, canonical zone, future deadline, and audit reason are server-controlled.
- Persistence: deletion retains the row and reason while removing it from public and active Moderator projections.
- Transactions: forced audit or alert persistence failures roll back publication, delivery, notifications, and audit together.
- Provenance: manual posts expose `origin: manual`, never expose the creating Participant, and do not use Source Feed identifiers.
- Lifecycle: a canonical reference prevents origin collisions, and both origins support Comments, alert delivery, food-gone review, and restore-or-expire resolution.
- Rewards: Buffet Gem state and exact-once ledger identity use opaque canonical references rather than feed-local post identifiers.
- Terminal behavior: deletion expires an open review, a stale restore fails, and a stale alert cannot record feedback.
- Ingestion: Source Feed ingestion rejects the reserved manual namespace.
- Filtering: manual posts obey text search, exact-zone, freshness, indexed deadline, and injected-clock expiry behavior.
- Accessibility: forms and destructive actions are located through visible labels and accessible button names.
- Responsive UI: the form has no horizontal overflow in the mobile and desktop Playwright projects.
- Migration: `009_manual_buffet_posts.sql` remains distinct from issue 7's `008_manual_marketplace_listings.sql`.

## Risks and recovery

- Manual records must not enter Source Feed reconciliation, but they must share user-facing Helpful Alert behavior.
  A canonical reference and compatibility lifecycle record keep provenance separate while reusing the established alert and review invariants without replacing existing data.
- Manual deadlines may expire while a Moderator page remains open.
  The public feed evaluates deadlines against the injected clock on every request and the frontend refreshes normally.
- Issue 7 also edits the development reset transaction.
  Preserve both table deletions when merging the branches.
- Rollback removes the additive manual routes, service, UI, and public projection.
  Existing Source Feed Buffet records need no data migration or repair.
